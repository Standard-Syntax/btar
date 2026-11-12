# BTAR

BTAR prepares brownfield Python repositories for agent work. It measures a Python 3.14+ verification baseline and generates the configuration that keeps that baseline repeatable.

BTAR itself is a TypeScript CLI that runs on Bun. It is installed locally with `bun link`. It is not published to npm.

## What BTAR checks

BTAR detects Python projects from `pyproject.toml`, `hatch.toml`, or `setup.py`. It runs these project commands through Hatch:

| Area | Command |
| --- | --- |
| Types | `hatch run pyrefly check --output-format=json` |
| Lint | `hatch run ruff check . --output-format=json` |
| Tests and coverage | `hatch run pytest --cov --cov-report=json:coverage.json` |

The generated project profile also provides Hypothesis for property tests, Gitleaks and Semgrep for security checks, and diff-cover for changed-line coverage.

## Install BTAR locally

```bash
git clone <btar-repository>
cd btar
bun install --frozen-lockfile
bun run build
bun link
export PATH="$(bun pm bin -g):$PATH"
```

`btar` is then available in your shell. The `PATH` entry selects Bun's local link when an older installation exists elsewhere in `PATH`. Run `bun unlink` in this repository to remove the local link.

## Execution consent

Analysis and fixes execute project-controlled Hatch configuration, plugins, dependencies, and tests with your privileges. Add `--trust-project` only after deciding the project is trusted. Without that flag BTAR reads project metadata but does not run Hatch or tests. This consent does not provide a sandbox. See [runtime and execution rules](docs/runtime.md).

## Analyze a Python project

```bash
btar analyze . --trust-project
btar analyze . --trust-project --json
btar analyze . --trust-project --fail-under 70
btar analyze . --trust-project --save-baseline
btar analyze . --trust-project --ratchet
```

`--json` is for automation. A missing tool, failed command, malformed report, or empty coverage report causes a nonzero exit. BTAR never treats unavailable evidence as a clean result.

## Generate project files

```bash
btar context generate python-toolchain .
```

Merge any generated candidate into the configuration files described below, preserving existing metadata. Then generate CI and agent guidance.

```bash
btar init-ci
btar context generate agents-md .
btar context generate pre-commit .
btar context generate hooks .
```

The AGENTS.md generator records detected project roots, existing paths, and declared Hatch scripts without running project code. Use `--build-command`, `--test-command`, and `--lint-command` to supply commands explicitly. Generated target-profile commands are guidance, not verified project checks.

To preserve an existing AGENTS.md, use `btar context generate agents-md . --update`. BTAR appends or replaces its marked block and preserves the surrounding content. It rejects malformed or duplicate markers. The default refuses to overwrite; `--force` replaces the file and cannot be combined with `--update`.

For historical failure evidence, capture `btar analyze . --json --trust-project > baseline.json` in a trusted project and pass `--baseline-report baseline.json` when generating. The report must match the detected Python project roots. A saved score alone does not record individual failures. Review unavailable measurements and do not treat coverage as proof that all tests passed.

For pstack, run `npx skills add backnotprop/pstack`. In the interactive selector, select all pstack skills and your target agents so `poteto-mode` has its dependencies. After installation, run `/setup-pstack` and `/poteto-mode`. See the [pstack README](https://github.com/backnotprop/pstack#readme). BTAR does not install skills or configure models.

`init-ci` validates the required Hatch default-environment dependencies before writing its output. Generate and merge the toolchain configuration first. The generated CircleCI file uses Python 3.14 and runs Hatch checks for types, lint, tests with coverage, Semgrep, and diff-cover, plus a separate Gitleaks job. Use `btar init-ci . --threshold 80` to require 80 percent changed-line coverage from diff-cover. Generation refuses to overwrite an existing file unless you pass `--force`.

## Prepare a project

BTAR expects a Hatch-managed project. Run `btar context generate python-toolchain .` to create a profile. If `pyproject.toml`, `hatch.toml`, `setup.py`, or `setup.cfg` already exists, BTAR writes `pyproject.btar.toml` as a merge candidate unless you select an explicit output path. When `hatch.toml` exists, merge the candidate's `[tool.hatch.*]` tables into it without the `tool.hatch.` prefix. For example, `[tool.hatch.envs.default]` becomes `[envs.default]`. Otherwise, merge those tables into `pyproject.toml`. Merge project metadata and the Ruff, pytest, and coverage tables into `pyproject.toml`, preserving the project's existing identity and settings.

Hatch gives top-level keys in `hatch.toml` precedence over `[tool.hatch]` in `pyproject.toml`. An `envs` table in `hatch.toml` replaces the entire pyproject environment table. `btar init-ci` validates the default environment dependencies from that effective table. It rejects missing tools or malformed configuration before writing CI.

```toml
[tool.hatch.envs.default]
python = "3.14"
dependencies = [
  "hypothesis>=6.170.15",
  "pyrefly>=1.4.1",
  "pytest>=9.2.0",
  "pytest-cov>=7.1.0",
  "ruff>=0.17.4",
  "semgrep>=1.185.0",
  "diff-cover>=11.0.1",
]
```

The generated profile includes Semgrep and diff-cover in Hatch. Install the official Gitleaks binary separately for local secret scans. Generated CI provisions Gitleaks and verifies its download checksum. See the generated CircleCI configuration for the full command sequence.

Baselines now record a versioned Python scoring scope and canonical project paths. Legacy baselines and changed project sets require deliberate replacement with `--save-baseline`.

## Score

BTAR returns a score out of 100.

| Dimension | Points |
| --- | --- |
| Pyrefly errors | 30 |
| Ruff errors | 30 |
| pytest-cov coverage | 40 |

Type and lint scores decrease logarithmically as errors increase. Coverage contributes linearly. The score is a prioritization signal. It does not prove that a project is safe to ship.

## Develop BTAR

```bash
bun run build
bun run typecheck
bun run lint
bun run test
bun run verify:python
```

`verify:python` creates a disposable Python 3.14 project and checks it through the built CLI. It installs Python tools and requires network access.

The implementation entry point is `src/cli.ts`. The built command is `dist/cli.js`.

## Further reading

- [User guide](docs/USER-GUIDE.md)
- [Python 3.14 and CircleCI design](docs/architecture/python314-circleci.md)
- [Readiness rubric](agent-readiness-scoring-rubric.md)
