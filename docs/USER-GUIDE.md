# Use BTAR with a Python repository

BTAR gives an existing Python repository a repeatable Python 3.14+ verification path. The project owns its code and dependencies. BTAR reads the project, runs its configured quality commands through Hatch, and can generate supporting files.

## Install BTAR

Install BTAR from a local checkout.

```bash
cd /path/to/btar
bun install --frozen-lockfile
bun run build
bun link
export PATH="$(bun pm bin -g):$PATH"
```

Run `btar` from the Python repository after linking it. The `PATH` entry selects Bun's local link when an older installation exists elsewhere in `PATH`.

## Add the Python verification tools

Use Hatch for the target repository. Add Pyrefly, Ruff, pytest, pytest-cov, and Hypothesis to a Hatch environment. The project must use Python 3.14 or newer.

```toml
[project]
requires-python = ">=3.14"

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

Run the checks directly before using BTAR.

```bash
hatch run pyrefly check --output-format=json
hatch run ruff check . --output-format=json
hatch run pytest --cov --cov-report=json:coverage.json
```

Use Hypothesis for behavior that has important invariants or large input spaces.

```python
from hypothesis import given, strategies as st

@given(st.lists(st.integers()))
def test_sort_preserves_length(values: list[int]) -> None:
    assert len(sorted(values)) == len(values)
```

Install the official Gitleaks binary for local secret scans. The generated CircleCI job downloads it and verifies its checksum. Semgrep and diff-cover are installed by the generated Hatch profile.

## Allow project execution

Use `--trust-project` only for repositories whose Hatch configuration, dependencies, and tests you trust to execute with your privileges. Analysis and fixes require that flag on each invocation. Detection alone does not execute project code. Generated Claude hooks explicitly opt into execution and belong only in trusted repositories.

## Analyze the repository

```bash
btar analyze . --trust-project
btar analyze . --trust-project --json
btar analyze . --trust-project --fail-under 70
```

BTAR scores Pyrefly errors, Ruff errors, and pytest-cov coverage. It exits with failure when it cannot obtain a valid measurement. A score is not a substitute for the checks themselves.

Save an approved score, then enforce it on later changes. Baselines include the Python scoring scope and relative project paths. Legacy baselines and changed project sets are incompatible until deliberately replaced.

```bash
btar analyze . --trust-project --save-baseline
git add .btar-score
git commit -m "Add BTAR baseline"
btar analyze . --trust-project --ratchet
```

## Generate repository guidance and CI

```bash
btar context generate python-toolchain .
```

Merge any generated candidate into pyproject.toml, preserving existing metadata. Then generate the remaining support files.

```bash
btar context generate agents-md .
btar context generate pre-commit .
btar context generate hooks .
btar init-ci
```

The Python toolchain generator writes `pyproject.toml` when the project has no project or legacy packaging metadata. For an existing `pyproject.toml`, `setup.py`, or `setup.cfg`, it writes `pyproject.btar.toml` as a merge candidate unless you pass an explicit output path. Merge the toolchain candidate first. The CircleCI generator validates the required Hatch dependency declarations before writing `.circleci/config.yml`. The configuration runs the Python checks through Hatch, then runs Gitleaks, Semgrep, and diff-cover. Use `btar init-ci . --threshold 80` to require 80 percent changed-line coverage. Review generated files before committing them. Use `--force` only when intentionally replacing an existing generated file.

## Work with findings

Run `btar fix . --trust-project` to apply Ruff fixes offered by the project. Review the diff and run the full verification sequence. BTAR does not automatically repair type errors, test failures, security findings, or insufficient changed-line coverage.

## Maintain BTAR

BTAR uses Bun for its TypeScript implementation.

```bash
bun run build
bun run typecheck
bun run lint
bun run test
```

The target profile supports Python only. A repository without Python markers produces no supported-project result.
