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
skip-install = true
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

Use `--trust-project` only for repositories whose Hatch configuration, dependencies, and tests you trust to execute with your privileges. Analysis and fixes require that flag on each invocation. Detection alone does not execute project code. Generated Claude post-edit hooks omit `--trust-project`. Review the command and add the flag only for a trusted repository. Generated pre-edit hooks invoke Hatch directly and require separate review before enabling.

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

Merge any generated candidate into the configuration files described below, preserving existing metadata. Then generate the remaining support files.

```bash
btar context generate agents-md .
btar context generate pre-commit .
btar context generate hooks .
btar init-ci
```

The AGENTS.md generator records detected Python roots, existing paths, and declared Hatch scripts without running project code. Use `--build-command`, `--test-command`, and `--lint-command` to supply commands. Target-profile commands are guidance, not verified checks.

Use `btar context generate agents-md . --update` to append or replace the BTAR managed block while preserving surrounding bytes. The default refuses to overwrite an existing file. `--force` replaces the file and cannot be combined with `--update`.

For historical failure evidence, capture `btar analyze . --json --trust-project > baseline.json` in a trusted project and pass `--baseline-report baseline.json` when generating. The report must match the detected Python roots. A saved score alone does not record individual failures. Review unavailable measurements and do not treat coverage as proof that all tests passed.

For pstack, install the complete skill set with `npx skills add backnotprop/pstack`, then run `/setup-pstack` and `/poteto-mode`. See the [pstack README](https://github.com/backnotprop/pstack#readme). BTAR does not install skills or configure models.

The Python toolchain generator writes `pyproject.toml` when the project has no project or legacy packaging metadata. For an existing `pyproject.toml`, `hatch.toml`, `setup.py`, or `setup.cfg`, it writes `pyproject.btar.toml` as a merge candidate unless you pass an explicit output path. Merge the toolchain candidate first. When `hatch.toml` exists, merge `[tool.hatch.*]` tables into it without the `tool.hatch.` prefix. For example, use `[envs.default]` and `[envs.default.scripts]`. Merge the project metadata, Ruff, pytest, and coverage settings into `pyproject.toml`, preserving existing identity and settings. Without `hatch.toml`, merge all relevant tables into `pyproject.toml`.

Hatch gives top-level keys in `hatch.toml` precedence over `[tool.hatch]` in `pyproject.toml`. A standalone `envs` table replaces the entire pyproject environment table. The CircleCI generator validates required dependencies in the effective default environment and rejects malformed configuration before writing `.circleci/config.yml`. The configuration runs the Python checks through Hatch, then runs Gitleaks, Semgrep, and diff-cover. Use `btar init-ci . --threshold 80` to require 80 percent changed-line coverage. Review generated files before committing them. Use `--force` only when intentionally replacing an existing generated file.

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

The target profile supports Python only. BTAR detects directories containing `pyproject.toml`, `hatch.toml`, or `setup.py` at high confidence. It detects `requirements.txt`, `Pipfile`, or `setup.cfg` at medium confidence. Marker detection uses filenames without validating their contents. A directory with a direct `.py` file also qualifies at medium confidence when it is outside an already detected project. Detection searches recursively until it finds a project, then stops descending into that project. Nested markers and scripts within it do not create additional projects. Sibling projects outside it remain separately detectable. A repository with neither a marker nor a qualifying `.py` file produces no supported-project result.
