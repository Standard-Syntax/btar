# Python 3.14 verification and CircleCI

BTAR has one analysis target. A target is a Python repository that uses Python 3.14 or newer and supplies its development tooling through Hatch.

The report holds three measurements. Pyrefly produces a type-error count. Ruff produces a lint-error count. pytest-cov produces coverage from a JSON report. Internal measurements retain raw output. JSON reports include the tool name, numeric result, and success state. A failed command, missing executable, malformed output, empty coverage report, or invalid percentage is a failed measurement.

The score remains 30 points for types, 30 for lint, and 40 for coverage. CI treats any unavailable measurement as a failure regardless of the score.

## Target project contract

The target project provides Hatch environments. BTAR checks the Hatch interpreter and fails before measurement when it is older than Python 3.14. BTAR invokes these commands.

```bash
hatch run pyrefly check --output-format=json
hatch run ruff check . --output-format=json
hatch run pytest --cov --cov-report=json:coverage.json
```

The generated project profile includes Hypothesis. The CircleCI profile adds Gitleaks, Semgrep, and diff-cover. These checks remain separate from the three-point score so a successful score cannot conceal a security or changed-line coverage failure.

## CircleCI contract

`btar context generate python-toolchain <directory>` creates a Python profile. It writes `pyproject.toml` when absent. It writes `pyproject.btar.toml` as a merge candidate when `pyproject.toml` already exists, unless the caller gives an output path. The profile uses a skip-install Hatch environment with Pyrefly, Ruff, pytest, pytest-cov, Hypothesis, Semgrep, and diff-cover. Gitleaks is an external binary required for local secret scans.

`btar init-ci [directory]` writes `.circleci/config.yml` unless the file already exists. With `--force`, it replaces that generated target. The generated job installs Hatch, then runs Ruff lint and format checks, Pyrefly, pytest with coverage, diff-cover, Gitleaks, and Semgrep. `--threshold` sets diff-cover's changed-line coverage requirement. It stores coverage.xml as an artifact.

The target CI file runs Python tools directly. It does not require BTAR to be installed.

## BTAR implementation

BTAR is implemented in TypeScript and runs on Bun. Its implementation checks are separate from the generated Python workflow.

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run lint
bun run test
```

The CLI uses Ink for terminal rendering. JSON output stays machine-readable and does not include terminal progress frames.
