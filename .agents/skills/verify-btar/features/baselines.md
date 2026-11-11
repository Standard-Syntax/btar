# Score baselines and ratchets

Users deliberately save a score baseline and reject later regressions or incompatible baseline scope.

## Sub-features

- `baseline-missing`: fail ratchet mode without a baseline.
- `baseline-save`: persist `.btar-score` only from complete measurements.
- `baseline-stable`: accept a matching baseline.
- `baseline-regression`: reject a measured score drop without rewriting the baseline.
- `baseline-incompatible`: reject incompatible baseline data.

## How to get to it (user POV)

Run `btar analyze <directory> --trust-project --save-baseline`, then run analysis with `--ratchet`. These flags must be used separately.

## Driving it with control.py

Preconditions: Launch, doctor, manual harness and pristine Python seed; no `.btar-score` exists.

- **Missing baseline.** Run `drive baseline-missing 1 analyze "$BTAR_TARGET" --trust-project --json --ratchet`. Require stderr to state no baseline was found and `test ! -e "$BTAR_TARGET/.btar-score"`.
- **Save.** Run `drive baseline-save 0 analyze "$BTAR_TARGET" --trust-project --json --save-baseline --fail-under 100`. Parse stdout and `.btar-score` as JSON; require score 100 in both. Copy baseline bytes with `cp "$BTAR_TARGET/.btar-score" "$BTAR_EVIDENCE/baseline-original.json"`.
- **Stable scope.** Run `drive baseline-stable 0 analyze "$BTAR_TARGET" --trust-project --json --ratchet`; require score 100 and no ratchet failure. Compare baseline bytes with the original using `cmp`.
- **Regression.** Run `printf '\nimport os\n' >>"$BTAR_TARGET/example.py"` and `drive baseline-regression 1 analyze "$BTAR_TARGET" --trust-project --json --ratchet`. Require a measured lower score and stderr `Ratchet failed`, not a tool-unavailable failure. `cmp "$BTAR_EVIDENCE/baseline-original.json" "$BTAR_TARGET/.btar-score"` must succeed. Restore `cp "$BTAR_EVIDENCE/seed-example.py" "$BTAR_TARGET/example.py"`.
- **Invalid baseline.** Write `printf '{}\n' >"$BTAR_TARGET/.btar-score"` and run `drive baseline-invalid 1 analyze "$BTAR_TARGET" --trust-project --json --ratchet`. Require an incompatible/invalid baseline diagnostic. Preserve that file as `$BTAR_EVIDENCE/baseline-invalid.json`.
- **Conflicting options.** Run `drive baseline-conflict 1 analyze "$BTAR_TARGET" --trust-project --json --ratchet --save-baseline`. Require a use-separately error; this early error need not produce a JSON report.
- **Proof.** Keep original/invalid baseline files, before/after source, report bodies and refusal diagnostics. Cleanup removes the fixture, never the original saved evidence.

## Gotchas

- Saving a new baseline is deliberate adoption of a score, not a ratchet check. Do not save after the regression just to make ratchet pass.
- Invalid JSON shape is exercised here; legacy scope and changed project-set incompatibility need their own fixtures and remain NOT_RUN.
- Do not count a nonzero exit as a regression proof until measurements and the ratchet-specific diagnostic agree.
