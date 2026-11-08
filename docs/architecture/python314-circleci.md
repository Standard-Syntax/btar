# Python 3.14 verification and CircleCI migration

## Domain model

**Analysis target** is an external codebase with a detected language and
working directory. **Verification adapter** runs the tools appropriate for
that language. **Measurement** is a numeric value plus tool identity,
raw evidence, and a success flag. **Evidence unavailable** means
missing binaries, failed tests, timeouts, malformed output, or empty reports.
These conditions are not equivalent to zero errors or zero coverage.

The readiness score remains 30 points for type checks, 30 for linting, and
40 for coverage. For CI use, any unavailable measurement causes the CLI to
exit nonzero, regardless of an otherwise high score.

## Python 3.14 profile

BTAR is implemented in TypeScript. Its Python profile targets other
repositories, and relies on their configured Python environments.

```bash
uv python install 3.14
uv add --dev pyrefly ruff pytest slipcover
uv sync --python 3.14
```

- **Types**: run `uv run --python 3.14 pyrefly check --output-format=json` and count error
  diagnostics, rejecting malformed or nonconforming data.
- **Lint and format**: Ruff checks and formats source files; generated
  pre-commit hooks include Ruff and the official system-installed Pyrefly hook.
- **Coverage**: run `uv run --python 3.14 python -m slipcover --json --out <temp> -m pytest -q`
  and parse `summary.percent_covered` from a fresh JSON report. Failed tests,
  reports with no files, invalid percentages, and missing reports fail closed.
- **Generated agent guidance**: uses `uv`, Python 3.14, Ruff, Pyrefly,
  and SlipCover. Legacy mypy settings should be migrated with
  `pyrefly init` and reviewed, not blindly deleted.

## CI ownership and rollout

BTAR's repository uses `.circleci/config.yml`. `btar init-ci` generates
the same path for a target repository with a Python 3.14 + Node executor.
The generator does not require replacing GitHub as the code host.
The existing GitHub Actions workflow is removed; CI execution migrates to
CircleCI.

### Acceptance criteria

1. BTAR passes `npm ci`, `npm run build`, `npm run typecheck`,
   `npm run lint`, and `npm test`.
2. Python parser and subprocess tests pass for valid, failed, missing,
   malformed, and empty output.
3. `circleci config validate .circleci/config.yml` passes.
4. Real CircleCI PR and main-branch pipelines pass.
5. Required GitHub status checks are migrated only after the equivalent
   CircleCI checks appear. Never remove protection during the transition.

No change to the nine-language detection model or score formula is included.
Python dependency compatibility under 3.14 is the target project's concern;
`uv sync --python 3.14` exposes incompatibilities explicitly.
