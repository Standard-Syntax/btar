---
name: verify-btar
description: Verify BTAR's built Bun CLI through real generation, Python analysis, baseline, CircleCI configuration, and lint-fix journeys. Use after CLI changes or when collecting reproducible user-path evidence.
---

# Verify BTAR

Read [the feature index](features/README.md) first. BTAR's primary surface is a short-lived CLI; `src/index.ts` is a secondary library surface. This skill drives `dist/cli.js` and never calls internal generators. No server, port, authentication, or global `bun link` is needed.

## Launch

From the BTAR checkout, in Bash on Linux with Python 3.11+:

```bash
export BTAR_ROOT="$PWD"
export BTAR_CONTROL="$BTAR_ROOT/.agents/skills/verify-btar/scripts/control.py"
BTAR_STORE="${XDG_STATE_HOME:-$HOME/.local/state}/btar-verification"
mkdir -p "$BTAR_STORE" &&
BTAR_EVIDENCE="$(mktemp -d "$BTAR_STORE/run-XXXXXXXX")" &&
export BTAR_EVIDENCE &&
bun install --frozen-lockfile >"$BTAR_EVIDENCE/install.txt" 2>&1 &&
bun run build >"$BTAR_EVIDENCE/build.txt" 2>&1
```

Require both commands to exit 0. Read their logs on failure and stop before driving. Bun must be 1.4.4 or newer. Readiness means the doctor below succeeds against the newly built command, not merely that `dist/` exists. Dependencies may require network access. Rebuild after source changes; the doctor records identity, but cannot prove an old bundle matches new source.

The automated generation journey creates its own empty target and cleans it in `finally` on success or failure. No live Python project is needed:

```bash
"$BTAR_CONTROL" generation --evidence "$BTAR_EVIDENCE" &&
python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["status"] == "PASS" and r["cleanup"] == "PASS"' "$BTAR_EVIDENCE/result.json" &&
test -d "$BTAR_EVIDENCE/after" &&
test ! -e "$(cat "$BTAR_EVIDENCE/target.txt")"
```

This includes doctor, terminal drives, assertions, file capture, and cleanup. Use a fresh evidence directory for every attempt: labels are exclusive and cannot overwrite previous proof.

For other journeys, first run doctor in a fresh evidence directory, then prepare this owned target and harness:

```bash
export BTAR_TARGET="$(mktemp -d /tmp/btar-verify-manual-XXXXXXXX)"
export HATCH_ENV_TYPE_VIRTUAL_PATH="$BTAR_TARGET/.venv"
printf '%s\n' "$BTAR_TARGET" >"$BTAR_EVIDENCE/target.txt"
cleanup_target() { python3 -c 'import os,shutil; shutil.rmtree(os.environ["BTAR_TARGET"], ignore_errors=True)'; }
trap cleanup_target EXIT
capture() {
  local label="$1" expected="$2"; shift 2
  "$BTAR_CONTROL" capture --evidence "$BTAR_EVIDENCE" --label "$label" \
    --cwd "$BTAR_TARGET" --expect "$expected" -- "$@"
}
drive() { local label="$1" expected="$2"; shift 2; capture "$label" "$expected" bun "$BTAR_ROOT/dist/cli.js" "$@"; }
term() {
  local label="$1" expected="$2"; shift 2
  "$BTAR_CONTROL" capture --evidence "$BTAR_EVIDENCE" --label "$label" \
    --cwd "$BTAR_TARGET" --expect "$expected" --terminal -- bun "$BTAR_ROOT/dist/cli.js" "$@"
}
```

Each human-facing command gets an isolated PTY through `term`. JSON uses `drive` with separate stdout/stderr pipes. Concurrent runs use distinct targets, evidence directories and Hatch virtual environments. Do not rebuild the shared BTAR bundle while another run is driving it. Hatch and package-download caches can still be shared; these recipes do not test cache isolation.

For analysis/baselines/fixes, seed a real trusted Python project via the user-facing generator:

```bash
term seed-toolchain 0 context generate python-toolchain "$BTAR_TARGET"
mkdir -p "$BTAR_TARGET/tests"
printf 'def double(value: int) -> int:\n    return value * 2\n' >"$BTAR_TARGET/example.py"
cat >"$BTAR_TARGET/tests/test_example.py" <<'PY'
from hypothesis import given
from hypothesis import strategies as st

from example import double


@given(st.integers())
def test_double(value: int) -> None:
    assert double(value) == value + value
PY
capture python-version 0 hatch run python --version
capture seed-format 0 hatch run ruff format .
cp "$BTAR_TARGET/pyproject.toml" "$BTAR_EVIDENCE/seed-pyproject.toml"
cp "$BTAR_TARGET/example.py" "$BTAR_EVIDENCE/seed-example.py"
cp "$BTAR_TARGET/tests/test_example.py" "$BTAR_EVIDENCE/seed-test.py"
```

Require Python 3.14+ in `python-version/stdout.txt`. Hatch must be installed; it may download Python and dependencies. This reuses the fixture design from `scripts/verify-python.ts`, but generates configuration through the CLI. That script is also available as `bun run verify:python`; it installs tools, runs diff-cover and live Semgrep, and removes its temporary project without retaining detailed proof. It is supplementary, not this skill's evidence collector.

## Doctor

Run this before any manual drive and whenever identity or runtime looks wrong:

```bash
"$BTAR_CONTROL" doctor --evidence "$BTAR_EVIDENCE"
```

This reads Bun version, the built CLI's version/help, Git revision/dirty status and input/bundle hashes. It writes only evidence; it does not install, build, run Hatch, or mutate the target. Expect `Doctor PASS`, commands analyze/init-ci/context/fix, and paths in this checkout. Inspect `build-inputs.json` and the launch logs to associate the bundle with the run. A doctor PASS does not establish Python tool availability. Use a new evidence directory if repeating doctor.

## Drive

Use [feature recipes](features/README.md). For a quick end-to-end proof, run `generation` as shown above. It covers all four context generators, candidate preservation, overwrite refusal, candidate force, custom output, AGENTS validation, and disabled hooks. It does not execute generated hooks. CI generation is a separate mapped feature.

For manual runs, `term LABEL EXPECTED_EXIT ...` captures terminal behavior; `drive LABEL EXPECTED_EXIT ...` captures clean JSON. `capture LABEL EXPECTED_EXIT COMMAND ...` captures real Hatch commands. Distinct labels identify each action and entry point. The helper fails when observed exit differs from expected. A deliberate refusal with expected exit 1 is a successful negative check, not a passing analysis.

## Evidence

Evidence lives in `$BTAR_EVIDENCE` under the persistent local state directory, outside every disposable target. Preserve:

- Command argv, cwd, injected environment overrides, timeout, timestamps, expected and actual exit code in each `command.json`.
- `stdout.txt` and `stderr.txt`; PTY output merges application streams in stdout and may include ANSI/CR characters. JSON runs must stay piped and parse as one complete JSON document.
- Build/install logs, revision/dirty state and input/bundle SHA-256 manifest.
- Before/after files, report bodies, baseline bytes, measured coverage and assertions appropriate to the feature. The automated journey saves complete `before/` and `after/` trees and a hashed file manifest in `result.json`.

Exercise real user commands and verify their resulting files, not internal setters, mocks or final messages alone. The automated journey checks that generation leaves no `.venv` or `.git`; this is filesystem evidence only. It captures no network trace and makes no zero-network claim. BTAR has no dry-run flag. Trusted analysis writes coverage/cache files and can download dependencies; fix changes source. Hooks are generated as data, never installed in the BTAR checkout or executed by this skill. No mocks are needed.

Report PASS/FAIL/NOT_RUN/BLOCKED per feature and entry point. A score or generated CI file does not prove hosted CI, security scans, dependency safety, or readiness of arbitrary repositories. Missing runtime prerequisites are BLOCKED with the failed command; assertion/behavior mismatches are FAIL. Never replace real Hatch tools with fake executables to get a green journey.

## Cleanup

The automated journey removes only its own recorded temporary target in `finally`, including after assertion failures. All subprocesses have a 900-second limit. On timeout or a caught Python exception, including Ctrl-C, the helper kills and reaps its owned command process group. Terminal commands run directly in that group with a controlling PTY. SIGTERM and SIGKILL do not run Python exception cleanup. Deliberately detached descendants are outside this guarantee. Never kill processes by name.

Manual journeys must copy proof before removing the owned target:

```bash
cleanup_target
trap - EXIT
test ! -e "$BTAR_TARGET"
test -s "$BTAR_EVIDENCE/build-inputs.json"
find "$BTAR_EVIDENCE" -type f -print
```

Run cleanup after failed iterations too. Do not delete `$BTAR_EVIDENCE`. No global link was created, so there is nothing to unlink. Installed checkout dependencies and the ignored build output remain reusable.

## Helpers

Executable helper: `scripts/control.py` (Python standard library).

```bash
"$BTAR_CONTROL" --help
"$BTAR_CONTROL" generation --evidence "$BTAR_EVIDENCE"
# In a fresh evidence directory:
"$BTAR_CONTROL" doctor --evidence "$BTAR_EVIDENCE"
"$BTAR_CONTROL" capture --evidence "$BTAR_EVIDENCE" --label cli-help \
  --cwd "$BTAR_ROOT" --expect 0 --terminal -- bun "$BTAR_ROOT/dist/cli.js" --help
```

Keep this map current with `/maintain-verification-skill`.
