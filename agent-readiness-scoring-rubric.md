# Python agent-readiness rubric

Use this rubric to assess a Python 3.14+ repository before relying on coding agents for substantial changes. It is a human assessment. BTAR's runtime score remains limited to Pyrefly, Ruff, and pytest-cov.

| Category | Points | Evidence |
| --- | ---: | --- |
| Fast and reliable CircleCI feedback | 20 | Recent green runs, elapsed time, and rerun rate |
| Pyrefly and Ruff | 20 | `hatch run pyrefly check` and `hatch run ruff check .` exit cleanly |
| pytest and pytest-cov | 20 | `hatch run pytest --cov --cov-report=json` produces a valid report |
| Security and change checks | 15 | Gitleaks, Semgrep, and diff-cover run in CI |
| Hypothesis coverage | 10 | Important invariants have property-based tests |
| Hatch and Python 3.14 contract | 10 | `requires-python >=3.14` and documented environments |
| Agent context | 5 | AGENTS.md states build, test, lint, and CI commands |

## Assessment worksheet

| Check | Score | Notes |
| --- | ---: | --- |
| CircleCI feedback | /20 | |
| Pyrefly and Ruff | /20 | |
| pytest and pytest-cov | /20 | |
| Gitleaks, Semgrep, and diff-cover | /15 | |
| Hypothesis | /10 | |
| Hatch and Python version | /10 | |
| Agent context | /5 | |
| Total | /100 | |

## Interpret the result

| Score | Meaning |
| --- | --- |
| 80-100 | Agents have reliable feedback for bounded changes. |
| 60-79 | Add or repair the weakest verification layer before autonomous work. |
| 40-59 | Use agents for exploration and narrow repairs with close review. |
| 0-39 | Establish the Python toolchain and CI before relying on agent changes. |

## Priority order

1. Make CircleCI run Hatch, Pyrefly, Ruff, and pytest-cov.
2. Remove type and lint failures and repair unreliable tests.
3. Add Gitleaks, Semgrep, and diff-cover.
4. Add Hypothesis tests for core invariants.
5. Record the commands and constraints in AGENTS.md.
