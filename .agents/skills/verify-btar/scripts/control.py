#!/usr/bin/env python3
"""Drive the built BTAR CLI and retain command evidence outside scratch targets."""
import argparse
import errno
import fcntl
import hashlib
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import termios
import time

ROOT = Path(__file__).resolve().parents[4]
CLI = ROOT / "dist/cli.js"


def record(evidence, label, argv, cwd, expected=0, terminal=False, timeout=900):
    destination = evidence / label
    destination.mkdir(parents=True, exist_ok=False)
    command = list(map(str, argv))
    env_overrides = {"HATCH_ENV_TYPE_VIRTUAL_PATH": str(Path(cwd) / ".venv")}
    metadata = {"argv": command, "cwd": str(cwd), "terminal": terminal,
                "env_overrides": env_overrides, "timeout_seconds": timeout,
                "expected_exit": expected, "started": time.time()}
    (destination / "command.json").write_text(json.dumps(metadata, indent=2) + "\n")
    env = dict(os.environ, **env_overrides)
    child = None
    master = slave = None
    with (destination / "stdout.txt").open("wb") as out, (destination / "stderr.txt").open("wb") as err:
        try:
            if terminal:
                master, slave = pty.openpty()
            child = subprocess.Popen(
                command, cwd=cwd, env=env, stdout=slave if terminal else out,
                stderr=slave if terminal else err,
                stdin=slave if terminal else subprocess.DEVNULL, start_new_session=True,
                # This single-threaded helper gives the child its controlling terminal.
                preexec_fn=(lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0)) if terminal else None,
            )
            deadline = time.monotonic() + timeout
            if slave is not None:
                os.close(slave)
                slave = None
                os.write(master, b"\x04")
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not select.select([master], [], [], remaining)[0]:
                        raise subprocess.TimeoutExpired(command, timeout)
                    try:
                        data = os.read(master, 65536)
                    except OSError as error:
                        if error.errno != errno.EIO:
                            raise
                        break
                    if not data:
                        break
                    out.write(data)
            status = child.wait(timeout=max(0, deadline - time.monotonic()))
        except BaseException as error:
            if child is not None:
                try:
                    os.killpg(child.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                child.wait()
            metadata["interrupted"] = True
            metadata["error"] = str(error)
            raise
        finally:
            for descriptor in (master, slave):
                if descriptor is not None:
                    os.close(descriptor)
            metadata["exit_code"] = child.returncode if child is not None else None
            metadata["finished"] = time.time()
            (destination / "command.json").write_text(json.dumps(metadata, indent=2) + "\n")
    if status != expected:
        raise RuntimeError(f"{label}: expected exit {expected}, got {status}; see {destination}")
    return (destination / "stdout.txt").read_text()


def doctor(evidence):
    version = record(evidence, "doctor-bun", ["bun", "--version"], ROOT).strip()
    parts = tuple(map(int, version.split("+")[0].split(".")))
    if parts < (1, 4, 4):
        raise RuntimeError(f"Bun too old: {version}")
    record(evidence, "doctor-version", ["bun", CLI, "--version"], ROOT)
    help_text = record(evidence, "doctor-help", ["bun", CLI, "--help"], ROOT)
    command_section = help_text.partition("\nCommands:\n")[2]
    commands = set(re.findall(r"^  ([a-z][a-z0-9-]*)(?=\s|$)", command_section, re.MULTILINE))
    if not {"analyze", "init-ci", "context", "fix"}.issubset(commands):
        raise RuntimeError("Unexpected CLI command surface")
    inputs = [ROOT / "package.json", ROOT / "bun.lock", CLI]
    missing = [str(path.relative_to(ROOT)) for path in inputs if not path.is_file()]
    sources = sorted((ROOT / "src").rglob("*.ts"))
    if not sources:
        missing.append("src/**/*.ts")
    if missing:
        raise RuntimeError(f"Missing required build inputs: {', '.join(missing)}")
    inputs += sources
    manifest = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in inputs}
    (evidence / "build-inputs.json").write_text(json.dumps(manifest, indent=2) + "\n")
    revision = record(evidence, "doctor-revision", ["git", "rev-parse", "HEAD"], ROOT).strip()
    record(evidence, "doctor-dirty", ["git", "status", "--short"], ROOT)
    print(f"Doctor PASS: {CLI}, Bun {version}, revision {revision}")


def snapshot(target, destination):
    shutil.copytree(target, destination)
    return {str(path.relative_to(target)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in sorted(target.rglob("*")) if path.is_file()}


def generation(evidence):
    doctor(evidence)
    target = Path(tempfile.mkdtemp(prefix="btar-verify-"))
    result = {"feature": "context-generation", "status": "FAIL"}
    try:
        (evidence / "target.txt").write_text(str(target) + "\n")
        def cli(label, *args, expected=0):
            return record(evidence, label, ["bun", CLI, *args], target, expected, terminal=True)
        before = snapshot(target, evidence / "before")
        cli("01-toolchain", "context", "generate", "python-toolchain", target)
        profile = (target / "pyproject.toml").read_bytes()
        import tomllib
        parsed = tomllib.loads(profile.decode())
        assert parsed["tool"]["hatch"]["envs"]["default"]["python"] == "3.14"
        cli("02-candidate", "context", "generate", "python-toolchain", target)
        assert (target / "pyproject.toml").read_bytes() == profile
        assert (target / "pyproject.btar.toml").read_bytes() == profile
        cli("03-refuse-candidate", "context", "generate", "python-toolchain", target, expected=1)
        assert (target / "pyproject.btar.toml").read_bytes() == profile
        (target / "pyproject.btar.toml").write_text("poisoned candidate\n")
        cli("04-force-candidate", "context", "generate", "python-toolchain", target, "--force")
        assert (target / "pyproject.btar.toml").read_bytes() == profile
        for kind, path in (("agents-md", "AGENTS.md"), ("pre-commit", ".pre-commit-config.yaml"),
                           ("hooks", ".claude/settings.json")):
            cli(f"05-{kind}", "context", "generate", kind, target)
            original = (target / path).read_bytes()
            assert original
            cli(f"06-refuse-{kind}", "context", "generate", kind, target, expected=1)
            assert (target / path).read_bytes() == original
        cli("07-validate", "context", "validate", target / "AGENTS.md")
        invalid = target / "invalid-AGENTS.md"
        invalid.write_text("not an agents file\n")
        diagnostic = cli("07-invalid", "context", "validate", invalid, expected=1)
        assert "Issues found:" in diagnostic
        hooks = json.loads((target / ".claude/settings.json").read_text())
        assert hooks == {"hooks": {
            "PreToolUse": [{"matcher": "Edit|MultiEdit|Write", "hooks": [
                {"type": "command", "command": f"cd -- '{target}' && hatch run pyrefly check"}]}],
            "PostToolUse": [{"matcher": "Edit|MultiEdit|Write", "hooks": [
                {"type": "command", "command": f"btar analyze '{target}' --json"}]}],
        }}
        (evidence / "hooks-default.json").write_text(json.dumps(hooks, indent=2) + "\n")
        cli("08-output", "context", "generate", "agents-md", target, "--output", target / "custom/AGENTS.md")
        assert (target / "custom/AGENTS.md").is_file()
        assert (target / "custom/AGENTS.md").read_bytes()
        cli("09-hooks-disabled", "context", "generate", "hooks", target, "--no-pre", "--no-post", "--force")
        assert json.loads((target / ".claude/settings.json").read_text()) == {"hooks": {}}
        after = snapshot(target, evidence / "after")
        assert before == {}
        assert not (target / ".venv").exists()
        assert not (target / ".git").exists()
        result.update(status="PASS", files=after, before=before,
                      limits=["Generation only; hooks were not executed.",
                              "No network trace captured; no claim of zero network activity.",
                              "CI generation, metrics, baselines and fixes NOT_RUN."])
    except BaseException as error:
        result["error"] = str(error)
        try:
            if not (evidence / "after").exists():
                snapshot(target, evidence / "after")
        except Exception as snapshot_error:
            result["snapshot_error"] = str(snapshot_error)
        raise
    finally:
        cleanup_error = None
        try:
            shutil.rmtree(target)
            if target.exists():
                raise RuntimeError(f"Scratch target still exists: {target}")
        except Exception as error:
            cleanup_error = error
            result.update(status="FAIL", cleanup="FAIL", cleanup_error=str(error))
        else:
            result["cleanup"] = "PASS"
        (evidence / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        print(f"Evidence retained: {evidence}")
        if cleanup_error is not None and sys.exc_info()[0] is None:
            raise cleanup_error


def main():
    def terminate(signum, _frame):
        raise SystemExit(128 + signum)

    signal.signal(signal.SIGTERM, terminate)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["doctor", "generation", "capture"])
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--label", default="command")
    parser.add_argument("--cwd", type=Path, default=ROOT)
    parser.add_argument("--expect", type=int, default=0)
    parser.add_argument("--terminal", action="store_true")
    args_list = sys.argv[1:]
    split = args_list.index("--") if "--" in args_list else len(args_list)
    args = parser.parse_args(args_list[:split])
    command = args_list[split + 1:]
    evidence = args.evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    if args.mode == "generation":
        generation(evidence)
    elif args.mode == "doctor":
        doctor(evidence)
    else:
        if not command:
            parser.error("capture needs -- followed by a command")
        record(evidence, args.label, command, args.cwd.resolve(), args.expect, args.terminal)
        print(f"Captured {args.label}: expected exit {args.expect}; {evidence}")


if __name__ == "__main__":
    main()
