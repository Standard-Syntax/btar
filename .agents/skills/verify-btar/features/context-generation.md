# Context generation

Users prepare Python toolchain configuration, agent guidance, pre-commit checks and Claude hook settings without executing the generated commands.

## Sub-features

- `context-toolchain`: create a Python 3.14 Hatch profile in an empty directory.
- `context-candidate`: preserve existing project configuration and write a merge candidate.
- `context-guidance`: generate and validate AGENTS.md.
- `context-integrations`: generate pre-commit and Claude settings.
- `context-output`: select a custom output path.
- `context-overwrite`: refuse existing outputs and deliberately replace a candidate with `--force`.
- `context-hooks-disabled`: omit both hooks on request.

## How to get to it (user POV)

Run `btar context generate python-toolchain`, `agents-md`, `pre-commit` or `hooks` with the target directory; run `btar context validate` with the AGENTS.md path. Each generator accepts `--output` and `--force`. Hooks also accept `--no-pre` and `--no-post`.

## Driving it with control.py

Preconditions: follow Launch in SKILL.md; no manual target or Hatch installation is needed.

- **Full generation journey.** Run `"$BTAR_CONTROL" generation --evidence "$BTAR_EVIDENCE"`. Expect exit 0 and `result.json` with status and cleanup both PASS.
- **New project.** Recorded action `01-toolchain` runs `context generate python-toolchain` against an empty directory. The saved `after/pyproject.toml` parses as TOML and selects Python 3.14.
- **Brownfield candidate.** Actions `02-candidate` through `04-force-candidate` generate `pyproject.btar.toml`, refuse a repeated write with exit 1, then explicitly force it. Both profile files retain the original profile bytes.
- **Guidance/integrations.** Actions `05-*` generate AGENTS.md, pre-commit YAML and Claude JSON. Actions `06-refuse-*` require exit 1 and unchanged bytes. `07-validate` requires successful AGENTS validation.
- **Custom output.** `08-output` writes `custom/AGENTS.md`; verify that file exists in `after/`.
- **Disable hooks.** `09-hooks-disabled` replaces settings with exactly `{"hooks": {}}`. The earlier hook commands remain saved in `hooks-default.json`; generated hooks were not executed.
- **Proof.** Inspect `before/` (empty), `after/`, per-action exit codes and `result.json` file hashes. Confirm `target.txt` names a removed directory and proof still exists.

## Gotchas

- Existing `pyproject.toml`, `hatch.toml`, `setup.py` or `setup.cfg` selects a candidate. The initial journey exercises the pyproject marker; the other marker variants remain separate coverage work.
- Candidate creation is not configuration merging. Preserve real metadata when adopting it.
- Explicit relative `--output` paths resolve against cwd, not necessarily the target argument; this journey uses absolute paths.
- Hooks can run project code if later enabled. Post-edit analysis omits execution consent and pre-edit Pyrefly runs Hatch directly. Generation proof does not establish hook execution behavior.
- The automated journey covers candidate force and hooks force, not all force/output combinations of every generator. Report those combinations NOT_RUN until driven.
