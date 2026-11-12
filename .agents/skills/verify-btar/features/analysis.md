# Python analysis

Users measure Python type errors, lint findings and coverage, inspect a score, and enforce a threshold without treating missing evidence as success.

## Sub-features

- `analysis-consent`: refuse project execution without explicit consent.
- `analysis-terminal`: show metrics and score in a terminal.
- `analysis-json`: return a machine-readable report.
- `analysis-threshold`: fail a score gate when the score is below the requested threshold.

## How to get to it (user POV)

Run `btar analyze <directory>` with `--trust-project`; choose `--json` for automation, `--quiet` to suppress progress, `--fail-under` for a gate, and `--config` for a custom config. Baseline options have a separate recipe.

## Driving it with control.py

Preconditions: Launch, doctor, manual harness and the real Python seed from SKILL.md. No fake Hatch, Pyrefly, Ruff or pytest executables.

- **Consent refusal.** Before the first trusted analysis, run `drive analysis-no-consent 1 analyze "$BTAR_TARGET" --json`. Parse `analysis-no-consent/stdout.txt` as JSON; stderr must explain `--trust-project`. Verify each metric reports failure due to consent. This does not prove zero network or zero process execution.
- **Human entry.** Run `term analysis-human 0 analyze "$BTAR_TARGET" --trust-project --fail-under 100`. Require actual successful metrics and score 100. BTAR reads a temporary coverage report and removes it after measurement.
- **JSON entry.** Run `drive analysis-json 0 analyze "$BTAR_TARGET" --trust-project --json --fail-under 100`. Require score 100, `gateResult` equal to `passed`, and nonempty, successful type, lint, and coverage measurements. Parse stdout as one JSON document with no progress or ANSI output.
- **Threshold rejection.** Append `printf '\nimport os\n' >>"$BTAR_TARGET/example.py"`, then run `drive analysis-gate 1 analyze "$BTAR_TARGET" --trust-project --json --fail-under 100`. Require parsed score below 100, a successful Ruff measurement with findings, a successful coverage measurement, and `gateResult` equal to `failed`; missing tool evidence is a different failure and cannot satisfy this assertion.
- **Proof.** Run the following assertions. Run `cp "$BTAR_TARGET/example.py" "$BTAR_EVIDENCE/analysis-changed.py"`; keep both human and JSON action transcripts, including the reported coverage metric. The temporary coverage report is not retained by BTAR. Restore `cp "$BTAR_EVIDENCE/seed-example.py" "$BTAR_TARGET/example.py"` before another feature.

```bash
python3 - "$BTAR_EVIDENCE/analysis-json/stdout.txt" "$BTAR_EVIDENCE/analysis-gate/stdout.txt" <<'PYCODE'
import json
import sys

clean, changed = (json.load(open(path)) for path in sys.argv[1:])
for report in (clean, changed):
    for name in ("typeStrictness", "lintErrors", "coverage"):
        measurements = report["metrics"][name]
        assert measurements and all(item["success"] for item in measurements.values())
assert clean["score"] == 100 and clean["gateResult"] == "passed"
assert changed["score"] < 100 and changed["gateResult"] == "failed"
assert any(item["value"] > 0 for item in changed["metrics"]["lintErrors"].values())
PYCODE
```

## Gotchas

- The generated toolchain can install large dependencies and uses real network/package caches. Capture an installation failure as BLOCKED rather than faking metrics.
- `.coverage`, `.venv` and tool caches are expected side effects of trusted analysis. Source should remain unchanged until the deliberate mutation.
- Root project markers suppress separate nested-project runs; sibling projects are separate. This single-root seed does not verify multi-project detection.
- `--quiet` and custom `--config` are additional entry variants, NOT_RUN by this recipe. A clean JSON path does not prove terminal formatting.
