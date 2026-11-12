# Context generation

Users prepare Python toolchain configuration, agent guidance, pre-commit checks and Claude hook settings without executing the generated commands.

## Sub-features

- `context-toolchain`: create a Python 3.14 Hatch profile in an empty directory.
- `context-candidate`: preserve existing project configuration and write a merge candidate.
- `context-guidance`: generate and validate AGENTS.md.
- `context-pstack`: document observed roots, paths, declared Hatch scripts, command overrides, and pstack setup without running project code.
- `context-update`: append or replace the BTAR block with `--update`, preserving surrounding bytes and rejecting malformed markers.
- `context-report`: import a saved analysis report with `--baseline-report`, showing measured issues separately from unavailable measurements.
- `context-integrations`: generate pre-commit and Claude settings.
- `context-output`: select a custom output path.
- `context-overwrite`: refuse existing outputs and deliberately replace a candidate with `--force`.
- `context-hooks-disabled`: omit both hooks on request.

## How to get to it (user POV)

Run `btar context generate python-toolchain`, `agents-md`, `pre-commit` or `hooks` with the target directory; run `btar context validate` with the AGENTS.md path. Each generator accepts `--output` and `--force`. Hooks also accept `--no-pre` and `--no-post`.

For AGENTS.md, use `--update` to preserve existing instructions. It cannot be combined with `--force`. Supply commands with `--build-command`, `--test-command`, and `--lint-command`. To import historical failure evidence, use `--baseline-report PATH` with saved `btar analyze --json` output for the same detected project roots. Relative report paths resolve against cwd. Generation does not execute those commands or establish that checks pass.

## Driving it with control.py

Preconditions: follow Launch in SKILL.md; no manual target or Hatch installation is needed.

- **Full generation journey.** Run `"$BTAR_CONTROL" generation --evidence "$BTAR_EVIDENCE"`. Expect exit 0 and `result.json` with status and cleanup both PASS.
- **New project.** Recorded action `01-toolchain` runs `context generate python-toolchain` against an empty directory. The saved `after/pyproject.toml` parses as TOML and selects Python 3.14.
- **Brownfield candidate.** Actions `02-candidate` through `04-force-candidate` generate `pyproject.btar.toml`, refuse a repeated write with exit 1, then explicitly force it. Both profile files retain the original profile bytes.
- **Guidance/integrations.** Actions `05-*` generate AGENTS.md, pre-commit YAML and Claude JSON. Actions `06-refuse-*` require exit 1 and unchanged bytes. `07-validate` requires successful AGENTS validation.
- **Custom output.** `08-output` writes `custom/AGENTS.md`; verify that file exists in `after/`.
- **Disable hooks.** `09-hooks-disabled` replaces settings with exactly `{"hooks": {}}`. The earlier hook commands remain saved in `hooks-default.json`; generated hooks were not executed.
- **Proof.** Inspect `before/` (empty), `after/`, per-action exit codes and `result.json` file hashes. Confirm `target.txt` names a removed directory and proof still exists.

The automated generation journey covers the original generation and refusal paths. Drive these additional paths separately through the built CLI:

1. Create a trusted or untrusted fixture report with `analyze --json`, recording its expected exit code. Without execution consent, require unavailable measurements.
2. Preserve an existing AGENTS.md snapshot. Run `agents-md --update --baseline-report PATH` with explicit command overrides. Check the report SHA256, values, unavailable measurements, command provenance, repository map, and pstack setup in the saved file.
3. Repeat the same update. Compare complete file bytes for idempotence and verify that bytes outside the marked block match the snapshot.
4. Supply a malformed report or mismatched project scope. Require exit 1 and unchanged destination bytes. Also reject duplicate or unmatched block markers and `--update --force`.

## Gotchas

- Existing `pyproject.toml`, `hatch.toml`, `setup.py` or `setup.cfg` selects a candidate. The initial journey exercises the pyproject marker; the other marker variants remain separate coverage work.
- Candidate creation is not configuration merging. Preserve real metadata when adopting it.
- Explicit relative `--output` paths resolve against cwd, not necessarily the target argument; this journey uses absolute paths.
- Hooks can run project code if later enabled. Post-edit analysis omits execution consent and pre-edit Pyrefly runs Hatch directly. Generation proof does not establish hook execution behavior.
- The automated journey covers candidate force and hooks force, not all force/output combinations of every generator. Report those combinations NOT_RUN until driven.
