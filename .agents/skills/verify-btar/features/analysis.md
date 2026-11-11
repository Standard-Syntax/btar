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

- **Consent refusal.** Before the first trusted analysis, run `drive analysis-no-consent 1 analyze "$BTAR_TARGET" --json`. Parse `analysis-no-consent/stdout.txt` as JSON; stderr must explain `--trust-project`. Require `test ! -e "$BTAR_TARGET/coverage.json"`. This observes absent coverage output; do not infer zero network or zero process execution from that alone.
- **Human entry.** Run `term analysis-human 0 analyze "$BTAR_TARGET" --trust-project --fail-under 100`. Require actual metrics and score 100, plus a nonempty `$BTAR_TARGET/coverage.json`.
- **JSON entry.** Run `drive analysis-json 0 analyze "$BTAR_TARGET" --trust-project --json --fail-under 100`. Run `python3 -c 'import json,sys; r=json.load(open(sys.argv[1])); assert r["score"] == 100' "$BTAR_EVIDENCE/analysis-json/stdout.txt"`. Review all measurements as successful; progress or ANSI output must not contaminate stdout.
- **Threshold rejection.** Append `printf '\nimport os\n' >>"$BTAR_TARGET/example.py"`, then run `drive analysis-gate 1 analyze "$BTAR_TARGET" --trust-project --json --fail-under 100`. Require parsed score below 100, actual Ruff findings and retained coverage evidence; missing tool evidence is a different failure and cannot satisfy this assertion.
- **Proof.** Copy coverage.json and the changed example.py to `$BTAR_EVIDENCE`; keep both human and JSON action transcripts. Restore `cp "$BTAR_EVIDENCE/seed-example.py" "$BTAR_TARGET/example.py"` before another feature.

## Gotchas

- The generated toolchain can install large dependencies and uses real network/package caches. Capture an installation failure as BLOCKED rather than faking metrics.
- Coverage, `.coverage`, `.venv` and tool caches are expected side effects of trusted analysis. Source should remain unchanged until the deliberate mutation.
- Root project markers suppress separate nested-project runs; sibling projects are separate. This single-root seed does not verify multi-project detection.
- `--quiet` and custom `--config` are additional entry variants, NOT_RUN by this recipe. A clean JSON path does not prove terminal formatting.
