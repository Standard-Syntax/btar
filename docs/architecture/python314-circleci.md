# Python 3.14 verification and CircleCI

BTAR has one analysis language and discovers projects recursively. Each project retains its own directory and metric keys. A target is a Python repository that uses Python 3.14 or newer and supplies its development tooling through Hatch.

The report holds three measurements. Pyrefly produces a type-error count. Ruff produces a lint-error count. pytest-cov produces coverage from a JSON report. Internal measurements retain raw output. JSON reports include the tool name, numeric result, and success state. A failed command, missing executable, malformed output, empty coverage report, or invalid percentage is a failed measurement.

The score remains 30 points for types, 30 for lint, and 40 for coverage. CI treats any unavailable measurement as a failure regardless of the score.

Analysis requires explicit `--trust-project` consent before any Hatch invocation. Reports use safe diagnostic categories and omit raw subprocess output. Empty detections retain the complete JSON schema and fail requested quality gates.

## Target project contract

The target project provides Hatch environments. BTAR checks the Hatch interpreter and fails before measurement when it is older than Python 3.14. BTAR invokes these commands.

```bash
hatch run pyrefly check --output-format=json
hatch run ruff check . --output-format=json
hatch run pytest --cov --cov-report=json:coverage.json
```

The generated project profile includes Hypothesis. The CircleCI profile adds Gitleaks, Semgrep, and diff-cover. These checks remain separate from the 100-point score so a successful score cannot conceal a security or changed-line coverage failure.

## CircleCI contract

`btar context generate python-toolchain <directory>` creates a Python profile. It writes `pyproject.toml` when project and legacy packaging metadata are absent. It writes `pyproject.btar.toml` as a merge candidate when `pyproject.toml`, `hatch.toml`, `setup.py`, or `setup.cfg` already exists, unless the caller gives an output path. When `hatch.toml` exists, merge the candidate's Hatch tables there without the `tool.hatch.` prefix and merge other tool settings and metadata into `pyproject.toml`. A top-level `envs` key in `hatch.toml` replaces the entire `[tool.hatch.envs]` table for dependency validation, matching Hatch precedence. The profile uses a skip-install Hatch environment with Pyrefly, Ruff, pytest, pytest-cov, Hypothesis, Semgrep, and diff-cover. Gitleaks is an external binary required for local secret scans.

`btar init-ci [directory]` writes `.circleci/config.yml` unless the file already exists. With `--force`, it replaces that generated target. Generation first validates the required Hatch dependency declarations without executing project code. The generated `quality` job installs Hatch, checks that the selected environment uses Python 3.14 or newer, then runs Ruff lint and format checks, Pyrefly, pytest with coverage, diff-cover, and Semgrep. `--threshold` sets diff-cover's changed-line coverage requirement, 70 percent by default. The job stores `coverage.xml` as an artifact.

The separate `secrets` job checks out the repository, downloads and verifies Gitleaks, and runs the secret scan. The jobs do not share a workspace or coverage artifacts.

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
