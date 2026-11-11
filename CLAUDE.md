# BTAR maintainer guide

BTAR is a Bun-run TypeScript CLI for Python 3.14+ brownfield repositories. It detects a Python project, measures Pyrefly, Ruff, and pytest-cov results through Hatch, and generates supporting CircleCI and context files.

## Commands

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run lint
bun run test
```

Run the built command with `bun dist/cli.js <command>` after a build. Use `bun link` when manually exercising the installed CLI.

## Architecture

- `src/cli.ts` owns command parsing and Ink terminal entry.
- `src/commands/` owns analyze, context, fix, and CircleCI generation.
- `src/core/detector.ts` recognizes Python project markers.
- `src/core/metrics/` invokes Hatch-managed Pyrefly, Ruff, and pytest-cov commands and parses their output.
- `src/core/scoring.ts` converts metrics into the 30, 30, and 40 point score.
- `src/core/context/` creates Python-focused AGENTS.md, pre-commit, and Claude hook files.
- `src/core/remediation/` supplies Ruff fixes, recommendations, and score baselines.

## Target contract

BTAR targets Python only. Target projects require Python 3.14 or newer and Hatch. The target tools are Pyrefly, Ruff, pytest, pytest-cov, Hypothesis, Gitleaks, Semgrep, and diff-cover. The report score uses only Pyrefly, Ruff, and pytest-cov. Missing or malformed evidence must fail the measurement.

## Tests

Keep tests next to TypeScript modules as `*.test.ts`. Test parsing and CLI-observable behavior. Use test fixtures for external command output. Do not accept a failed command or missing report as an empty result.
