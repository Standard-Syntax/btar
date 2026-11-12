# CircleCI configuration

Users generate a CircleCI quality workflow after declaring the required Hatch tools, with explicit protection against replacing an existing workflow.

## Sub-features

- `ci-prerequisites`: reject a target without the required effective Hatch dependencies.
- `ci-create`: write `.circleci/config.yml`.
- `ci-options`: select changed-line coverage and comparison branch.
- `ci-overwrite`: preserve an existing file unless `--force` is given.

## How to get to it (user POV)

Run `btar init-ci [directory]`; omitted directory means the current directory. Options are `--threshold`, `--base-branch` and `--force`.

## Driving it with control.py

Preconditions: Launch, doctor and the manual harness; start with the empty manual target, before seeding the toolchain.

- **Reject missing tools.** Run `term ci-missing 1 init-ci "$BTAR_TARGET"` and `test ! -e "$BTAR_TARGET/.circleci/config.yml"`. Retain the missing-dependency diagnostic.
- **Prepare.** Run `term ci-profile 0 context generate python-toolchain "$BTAR_TARGET"`.
- **Current-directory entry.** Run `term ci-default 0 init-ci`. Require a nonempty `.circleci/config.yml` in the target and copy it: `cp "$BTAR_TARGET/.circleci/config.yml" "$BTAR_EVIDENCE/ci-default.yml"`.
- **Refuse replacement.** Run `term ci-refuse 1 init-ci "$BTAR_TARGET"`; then `cmp "$BTAR_EVIDENCE/ci-default.yml" "$BTAR_TARGET/.circleci/config.yml"` must succeed.
- **Explicit directory/options.** Run `term ci-force 0 init-ci "$BTAR_TARGET" --force --threshold 80 --base-branch develop`. Copy the result to `$BTAR_EVIDENCE/ci-options.yml`. Inspect it for Python 3.14, Pyrefly, Ruff, pytest coverage, Semgrep, diff-cover with threshold 80 and origin/develop, and a Gitleaks job with checksum verification.
- **Invalid option.** Run `term ci-invalid 1 init-ci "$BTAR_TARGET" --force --threshold 101`; compare the file with the saved `ci-options.yml` and require no change.
- **Proof.** Preserve both generated workflows, command records and comparison outcomes before Cleanup. Generated content is the observable result; actual hosted jobs are a different verification task.

## Gotchas

- This fixture declares all dependencies in `pyproject.toml`; it does not exercise hatch.toml precedence. An `envs` table in hatch.toml replaces the pyproject environment table. Record that variant NOT_RUN until separately driven.
- Validation checks declarations without running Hatch. Successful generation does not prove executable checks or passing CI.
- Default coverage is 70; threshold 80 is deliberately exercised here. Invalid thresholds must not rewrite output.
