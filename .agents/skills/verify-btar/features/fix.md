# Lint fixes

Users apply available Ruff repairs to trusted Python projects and inspect the actual source changes.

## Sub-features

- `fix-consent`: require project execution consent before changing source.
- `fix-default`: apply fixes through Hatch/Ruff.
- `fix-language`: select Python explicitly.
- `fix-unsupported`: reject an undetected language.

## How to get to it (user POV)

Run `btar fix <directory> --trust-project`, optionally with `--language python` or `--quiet`.

## Driving it with control.py

Preconditions: Launch, doctor, manual harness and pristine Python seed; real Hatch/Ruff available.

- **Introduce a fixable issue.** Run `printf 'import os\n\ndef double(value: int) -> int:\n    return value * 2\n' >"$BTAR_TARGET/example.py"`. Save it with `cp "$BTAR_TARGET/example.py" "$BTAR_EVIDENCE/fix-before.py"`.
- **Refuse execution.** Run `term fix-no-consent 1 fix "$BTAR_TARGET"`; require a consent diagnostic and `cmp "$BTAR_EVIDENCE/fix-before.py" "$BTAR_TARGET/example.py"`.
- **Default entry.** Run `term fix-default 0 fix "$BTAR_TARGET" --trust-project`. Require the unused `import os` to be removed from the stored source; preserve it as `$BTAR_EVIDENCE/fix-default-after.py`.
- **Language entry.** Restore `cp "$BTAR_EVIDENCE/fix-before.py" "$BTAR_TARGET/example.py"`, then run `term fix-python 0 fix "$BTAR_TARGET" --trust-project --language python`. Require the unused import removed again.
- **Independent check.** Run `capture fix-ruff-check 0 hatch run ruff check .` and `capture fix-pytest 0 hatch run pytest -q`. Preserve the final example.py before Cleanup.
- **Unsupported language.** Run `term fix-language-missing 1 fix "$BTAR_TARGET" --trust-project --language javascript`; require `Language not detected` and unchanged source.
- **Proof.** Keep before/after source and a diff, expected refusal exits, fix transcripts and independent Ruff/pytest results. A success summary without source evidence is insufficient.

## Gotchas

- No dry-run mode exists. Only the owned fixture is writable in this recipe.
- Fix applies available lint repairs; it does not promise type, coverage, test or security repairs. Files-modified counts are not a substitute for the diff.
- `--quiet` remains a separate NOT_RUN entry variant. Post-fix full readiness analysis is separate from proving the repair itself.
