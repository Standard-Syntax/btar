#!/usr/bin/env python3
import contextlib
import ctypes
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("control", Path(__file__).with_name("control.py"))
control = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(control)
HELP = "Usage: btar\n\nCommands:\n  analyze [options]\n  init-ci [options]\n  context\n  fix [options]\n"


class ControlTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="btar-control-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.evidence = self.root / "evidence"
        self.evidence.mkdir()

    def test_environment_override_is_recorded_and_applied(self):
        output = control.record(self.evidence, "env", [sys.executable, "-c",
            "import os; print(os.environ['HATCH_ENV_TYPE_VIRTUAL_PATH'])"], self.root)
        metadata = json.loads((self.evidence / "env/command.json").read_text())
        self.assertEqual(output.strip(), str(self.root / ".venv"))
        self.assertEqual(metadata["env_overrides"], {"HATCH_ENV_TYPE_VIRTUAL_PATH": output.strip()})

    def test_terminal_has_controlling_session_and_merged_output(self):
        output = control.record(self.evidence, "terminal", [sys.executable, "-c",
            "import os,sys; print(os.isatty(0),os.isatty(1),os.isatty(2)); "
            "print(os.getpid()==os.getsid(0)==os.getpgrp()==os.tcgetpgrp(0)); "
            "print('stderr marker',file=sys.stderr)"], self.root, terminal=True)
        self.assertIn("True True True", output)
        self.assertIn("True", output.splitlines())
        self.assertIn("stderr marker", output)
        self.assertEqual((self.evidence / "terminal/stderr.txt").read_bytes(), b"")

    def test_pipe_output_remains_separate_json(self):
        output = control.record(self.evidence, "pipe", [sys.executable, "-c",
            "import sys; print('{\"ok\":true}'); print('diagnostic',file=sys.stderr)"], self.root)
        self.assertEqual(json.loads(output), {"ok": True})
        self.assertEqual((self.evidence / "pipe/stderr.txt").read_text(), "diagnostic\n")

    def test_launch_failure_retains_finished_metadata(self):
        with self.assertRaises(FileNotFoundError):
            control.record(self.evidence, "missing", [self.root / "missing"], self.root, terminal=True)
        metadata = json.loads((self.evidence / "missing/command.json").read_text())
        self.assertIn("finished", metadata)
        self.assertIsNone(metadata["exit_code"])

    def test_timeout_kills_owned_terminal_processes(self):
        # Adopt test grandchildren so the test can reap them even under a container PID 1.
        libc = ctypes.CDLL(None, use_errno=True)
        self.assertEqual(libc.prctl(36, 1, 0, 0, 0), 0)
        try:
            for terminal in (False, True):
                with self.subTest(terminal=terminal):
                    label = f"timeout-{terminal}"
                    pidfile = self.root / f"{label}.pids"
                    code = (
                        "import os,signal,time; "
                        "signal.signal(signal.SIGHUP,signal.SIG_IGN); "
                        "signal.signal(signal.SIGTERM,signal.SIG_IGN); "
                        "child=os.fork(); "
                        f"f=open({str(pidfile)!r},'a'); f.write(str(os.getpid())+'\\n'); f.close(); "
                        "time.sleep(60)"
                    )
                    try:
                        with self.assertRaises(subprocess.TimeoutExpired):
                            control.record(self.evidence, label, [sys.executable, "-c", code],
                                           self.root, terminal=terminal, timeout=5)
                        pids = [int(pid) for pid in pidfile.read_text().splitlines()]
                        self.assertEqual(len(pids), 2)
                        for pid in pids:
                            try:
                                os.waitpid(pid, 0)
                            except ChildProcessError:
                                pass
                            with self.assertRaises(ProcessLookupError):
                                os.kill(pid, 0)
                        metadata = json.loads((self.evidence / label / "command.json").read_text())
                        self.assertTrue(metadata["interrupted"])
                        self.assertEqual(metadata["exit_code"], -signal.SIGKILL)
                    finally:
                        if pidfile.exists():
                            for pid in map(int, pidfile.read_text().splitlines()):
                                try:
                                    os.kill(pid, signal.SIGKILL)
                                    os.waitpid(pid, 0)
                                except (ProcessLookupError, ChildProcessError):
                                    pass
        finally:
            libc.prctl(36, 0, 0, 0, 0)

    def doctor_fixture(self, help_text=HELP):
        for name, content in {
            "package.json": "{}", "bun.lock": "{}", "src/index.ts": "export {};",
            "dist/cli.js": "console.log(process.argv.includes('--help') ? " +
                           json.dumps(help_text) + " : '1.0.0');",
        }.items():
            path = self.root / name
            path.parent.mkdir(exist_ok=True)
            path.write_text(content)
        return patch.multiple(control, ROOT=self.root, CLI=self.root / "dist/cli.js")

    def test_doctor_rejects_substring_command_and_description_matches(self):
        for help_text in (HELP.replace("  fix ", "  prefix "),
                          HELP.replace("  fix [options]\n", "  status  fix errors\n"),
                          "These commands analyze init-ci context fix are unavailable\n"):
            with self.subTest(help_text=help_text), self.doctor_fixture(help_text):
                evidence = Path(tempfile.mkdtemp(dir=self.evidence))
                with self.assertRaisesRegex(RuntimeError, "command surface"):
                    control.doctor(evidence)

    def test_doctor_rejects_missing_required_inputs(self):
        for missing in ("package.json", "bun.lock", "src/index.ts"):
            with self.subTest(missing=missing), self.doctor_fixture():
                (self.root / missing).unlink()
                evidence = Path(tempfile.mkdtemp(dir=self.evidence))
                with self.assertRaisesRegex(RuntimeError, "Missing required build inputs"):
                    control.doctor(evidence)
                self.assertFalse((evidence / "build-inputs.json").exists())

    def test_doctor_accepts_exact_commands_and_records_required_inputs(self):
        with self.doctor_fixture(), contextlib.redirect_stdout(io.StringIO()):
            subprocess.run(["git", "init", "--quiet", str(self.root)], check=True)
            subprocess.run(["git", "-c", "user.name=Control Test", "-c", "user.email=test@example.invalid",
                            "commit", "--allow-empty", "--quiet", "-m", "fixture"], cwd=self.root, check=True)
            control.doctor(self.evidence)
        manifest = json.loads((self.evidence / "build-inputs.json").read_text())
        self.assertEqual(set(manifest), {"package.json", "bun.lock", "dist/cli.js", "src/index.ts"})


if __name__ == "__main__":
    unittest.main()
