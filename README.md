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

## Analyze a Python project

```bash
btar analyze .
btar analyze . --json
btar analyze . --fail-under 70
btar analyze . --save-baseline
btar analyze . --ratchet
```

`--json` is for automation. A missing tool, failed command, malformed report, or empty coverage report causes a nonzero exit. BTAR never treats unavailable evidence as a clean result.

## Generate project files

```bash
btar init-ci
btar context generate python-toolchain .
btar context generate agents-md .
btar context generate pre-commit .
btar context generate hooks .
```

The generated CircleCI file uses Python 3.14 and runs Hatch checks for types, lint, tests with coverage, Semgrep, and diff-cover, plus a separate Gitleaks job. Use `btar init-ci . --threshold 80` to require 80 percent changed-line coverage from diff-cover. Generation refuses to overwrite an existing file unless you pass `--force`.

## Prepare a project

BTAR expects a Hatch-managed project. Run `btar context generate python-toolchain .` to create a profile. If `pyproject.toml` already exists, BTAR writes `pyproject.btar.toml` as a merge candidate unless you select an explicit output path. Add the resulting development dependencies to the target project's `pyproject.toml`.

```toml
[tool.hatch.envs.default]
python = "3.14"
dependencies = [
  "hypothesis>=6.170.15",
  "pyrefly>=1.4.1",
  "pytest>=9.2.0",
  "pytest-cov>=7.1.0",
  "ruff>=0.17.4",
]
```

The generated profile includes Semgrep and diff-cover in Hatch. Install the official Gitleaks binary separately for local secret scans. Generated CI provisions Gitleaks and verifies its download checksum. See the generated CircleCI configuration for the full command sequence.

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
