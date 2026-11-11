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

## Analyze the repository

```bash
btar analyze .
btar analyze . --json
btar analyze . --fail-under 70
```

BTAR scores Pyrefly errors, Ruff errors, and pytest-cov coverage. It exits with failure when it cannot obtain a valid measurement. A score is not a substitute for the checks themselves.

Save an approved score, then enforce it on later changes.

```bash
btar analyze . --save-baseline
git add .btar-score
git commit -m "Add BTAR baseline"
btar analyze . --ratchet
```

## Generate repository guidance and CI

```bash
btar context generate agents-md .
btar context generate pre-commit .
btar context generate hooks .
btar context generate python-toolchain .
btar init-ci
```

The Python toolchain generator writes `pyproject.toml` when the project has none. For an existing project, it writes `pyproject.btar.toml` as a merge candidate unless you pass an explicit output path. The CircleCI generator writes `.circleci/config.yml`. The configuration runs the Python checks through Hatch, then runs Gitleaks, Semgrep, and diff-cover. Use `btar init-ci . --threshold 80` to require 80 percent changed-line coverage. Review generated files before committing them. Use `--force` only when intentionally replacing an existing generated file.

## Work with findings

Run `btar fix .` to apply Ruff fixes offered by the project. Review the diff and run the full verification sequence. BTAR does not automatically repair type errors, test failures, security findings, or insufficient changed-line coverage.

## Maintain BTAR

BTAR uses Bun for its TypeScript implementation.

```bash
bun run build
bun run typecheck
bun run lint
bun run test
```

The target profile supports Python only. A repository without Python markers produces no supported-project result.
