#!/usr/bin/env python3
"""Drive the built BTAR CLI and retain command evidence outside scratch targets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[4]
CLI = ROOT / "dist/cli.js"


def record(evidence, label, argv, cwd, expected=0, terminal=False):
    destination = evidence / label
    destination.mkdir(parents=True, exist_ok=False)
    command = list(map(str, argv))
    # util-linux script gives each human-facing drive its own PTY. JSON stays piped.
    if terminal:
        import shlex
        command = ["script", "--quiet", "--return", "--command", shlex.join(command), "/dev/null"]
    metadata = {"argv": list(map(str, argv)), "cwd": str(cwd), "terminal": terminal,
                "expected_exit": expected, "started": time.time()}
    (destination / "command.json").write_text(json.dumps(metadata, indent=2) + "\n")
    env = dict(os.environ, HATCH_ENV_TYPE_VIRTUAL_PATH=str(Path(cwd) / ".venv"))
    with (destination / "stdout.txt").open("wb") as out, (destination / "stderr.txt").open("wb") as err:
        child = subprocess.Popen(command, cwd=cwd, env=env, stdout=out, stderr=err,
                                 stdin=subprocess.DEVNULL, start_new_session=True)
        try:
            status = child.wait(timeout=900)
        except BaseException:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            metadata["interrupted"] = True
            raise
        finally:
            metadata["exit_code"] = child.returncode
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
    if not all(word in help_text for word in ("analyze", "init-ci", "context", "fix")):
        raise RuntimeError("Unexpected CLI command surface")
    inputs = [ROOT / "package.json", ROOT / "bun.lock", CLI]
    inputs += sorted((ROOT / "src").rglob("*.ts"))
    manifest = {str(path.relative_to(ROOT)): hashlib.sha256(path.read_bytes()).hexdigest()
                for path in inputs if path.is_file()}
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
    (evidence / "target.txt").write_text(str(target) + "\n")
    result = {"feature": "context-generation", "status": "FAIL"}
    try:
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
        hooks = json.loads((target / ".claude/settings.json").read_text())
        assert "PreToolUse" in hooks["hooks"] and "PostToolUse" in hooks["hooks"]
        (evidence / "hooks-default.json").write_text(json.dumps(hooks, indent=2) + "\n")
        cli("08-output", "context", "generate", "agents-md", target, "--output", target / "custom/AGENTS.md")
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
        if not (evidence / "after").exists():
            snapshot(target, evidence / "after")
        raise
    finally:
        shutil.rmtree(target)
        result["cleanup"] = "PASS" if not target.exists() else "FAIL"
        (evidence / "result.json").write_text(json.dumps(result, indent=2) + "\n")
        assert (evidence / "after").is_dir() and (evidence / "result.json").is_file()
        print(f"Evidence retained: {evidence}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=["doctor", "generation", "capture"])
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--label", default="command")
    parser.add_argument("--cwd", type=Path, default=ROOT)
    parser.add_argument("--expect", type=int, default=0)
    parser.add_argument("--terminal", action="store_true")
    # Split explicitly so arbitrary BTAR flags after -- are never parsed as helper flags.
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
