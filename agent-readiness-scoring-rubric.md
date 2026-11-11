# Python agent-readiness rubric

Use this rubric to assess a Python 3.14+ repository before relying on coding agents for substantial changes. It is a human assessment. BTAR's runtime score remains limited to Pyrefly, Ruff, and pytest-cov.

Record the assessed commit, command exit codes, report paths, and CI run links in the worksheet. Award only the points defined below. Missing, stale, failed, or unverifiable evidence earns zero for that component. Add the components within each category, then sum the categories. These human-assessment rules do not change BTAR's runtime score.

| Category | Points | Evidence |
| --- | ---: | --- |
| Fast and reliable CircleCI feedback | 20 | Recent green runs, elapsed time, and rerun rate |
| Pyrefly and Ruff | 20 | `hatch run pyrefly check` and `hatch run ruff check .` exit cleanly |
| pytest and pytest-cov | 20 | `hatch run pytest --cov --cov-report=json:coverage.json` exits zero and produces a fresh, non-empty, valid report |
| Security and change checks | 15 | Gitleaks and Semgrep exit zero with no findings; diff-cover exits zero at the required threshold |
| Hypothesis coverage | 10 | Important invariants have property-based tests |
| Hatch and Python 3.14 contract | 10 | `requires-python >=3.14` and documented environments |
| Agent context | 5 | AGENTS.md states build, test, lint, and CI commands |

## Allocate points

Each component awards its full stated value or zero. Do not interpolate or award points for a tool merely being installed.

- **CircleCI feedback, 20 points.** Use the latest 20 completed pipelines on the default branch, or all pipelines if fewer exist. Award 10 points only when all required jobs pass on every sampled pipeline's first attempt. Award 5 points when the median elapsed time from pipeline creation to completion is at most 5 minutes. Award 5 points when no sampled pipeline required a rerun. Record the sample size, durations, and reruns. No completed pipelines earns zero for this category.
- **Pyrefly and Ruff, 20 points.** Award 10 points for Pyrefly exiting zero with valid diagnostics and no errors. Award 10 points when both Ruff lint and `hatch run ruff format --check .` exit zero with no violations.
- **pytest and pytest-cov, 20 points.** Award 20 points only when pytest exits zero and its fresh JSON report contains at least one measured file and a finite `totals.percent_covered` between 0 and 100 inclusive. Delete stale coverage output before running. A failed test suite earns zero even when it writes valid coverage. Record the measured percentage separately. This component verifies usable test evidence and does not impose an overall coverage threshold.
- **Security and change checks, 15 points.** Award 5 points for a successful Gitleaks CI scan with no findings. Award 5 points for a successful Semgrep CI scan using the project's rules with `--error --strict` and no findings. Award 5 points for a successful diff-cover CI check against the intended base with `--fail-under` set to the project's required threshold, 70 percent by default in generated CI. Record the configured threshold and base. Findings, command failures, and unmet thresholds earn zero for the affected component and block acceptance regardless of the total score.
- **Hypothesis coverage, 10 points.** Before scoring, list the project's core invariants and the Hypothesis tests that exercise each one. Award 5 points when every listed invariant has a corresponding property-based test. Award another 5 points when those tests run and pass. An empty inventory or no property-based tests earns zero.
- **Hatch and Python contract, 10 points.** Award 5 points when project metadata declares `requires-python = ">=3.14"` or a stricter compatible minimum. Award 5 points when the documented Hatch environment starts successfully, reports Python 3.14 or newer, and provides the documented verification dependencies. For a non-package repository, the environment must use `skip-install = true`.
- **Agent context, 5 points.** Award 1 point each when AGENTS.md documents a working build command, test command, lint command, CI command, and project constraints. A project with no build step must explicitly say so to earn that point. Verify commands from a clean checkout.

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
