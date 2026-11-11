# Agent readiness for Python repositories

AI coding agents work best when a repository gives them fast, objective feedback. For a Python 3.14+ project, BTAR standardizes that feedback around Hatch, Pyrefly, Ruff, pytest, pytest-cov, Hypothesis, Gitleaks, Semgrep, diff-cover, and CircleCI.

Pyrefly, Ruff, and pytest-cov feed BTAR's 100-point score. Gitleaks, Semgrep, and diff-cover are independent gates. A high score does not override a security finding, a failing test, or insufficient changed-line coverage.

## Establish the feedback loop

Define the project environment in `pyproject.toml`, then run the commands locally before adding CI.

```bash
hatch run pyrefly check --output-format=json
hatch run ruff check . --output-format=json
hatch run ruff format --check .
hatch run pytest --cov --cov-report=json:coverage.json --cov-report=xml:coverage.xml
gitleaks detect --no-banner
hatch run semgrep scan --config p/python --error --strict .
hatch run diff-cover coverage.xml --compare-branch origin/main --fail-under 70
```

Fetch `origin/main` before the diff-cover check, or select your project's base branch. Use the threshold passed to `btar init-ci --threshold` if it differs from the default of 70.

Use the same checks in CircleCI. Keep a command in AGENTS.md only if a contributor can run it from a clean checkout.

## Write tests that constrain behavior

Use pytest examples for known cases. Use Hypothesis for invariants, parsers, serializers, boundaries, and other input-rich behavior. Assert observable results. Do not weaken tests to make a generated change pass.

## Work in small verified units

State the behavior to preserve or add. Change the smallest useful unit. Run the nearest check, then the complete verification set before review. Use BTAR's ratchet only after saving an approved baseline.

## What BTAR generates

`btar init-ci` generates separate CircleCI `quality` and `secrets` jobs. `btar context generate agents-md`, `pre-commit`, and `hooks` generate local guidance and integration files. Each command refuses to overwrite an existing target unless invoked with `--force`.
