# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BTAR (Brownfield-to-Agent-Ready) is a CLI tool that analyzes codebases and produces an "agent-readiness" score (0-100). It detects languages, runs linters/type-checkers/coverage tools, and generates context files (AGENTS.md, pre-commit configs, Claude Code hooks) to help AI coding agents work more effectively.

## Commands

```bash
npm run build      # TypeScript compilation (tsc)
npm run dev        # Watch mode for development
npm test           # Run vitest (all tests)
npx vitest run src/core/scoring.test.ts  # Single test file
```

CLI commands (after build):
```bash
node dist/cli.js analyze <directory>           # Score a codebase
node dist/cli.js analyze . --json              # JSON output
node dist/cli.js analyze . --ratchet           # Enforce baseline score
node dist/cli.js fix <directory>               # Auto-fix lint issues
node dist/cli.js context validate              # Validate AGENTS.md
node dist/cli.js context generate agents-md    # Generate AGENTS.md
node dist/cli.js context generate pre-commit   # Generate pre-commit config
node dist/cli.js context generate hooks        # Generate Claude Code hooks
node dist/cli.js init-ci                       # Generate CircleCI configuration
```

## Architecture

```
src/
├── cli.ts              # Commander-based CLI entry point
├── index.ts            # Package exports (VERSION constant)
├── commands/           # CLI command implementations
│   ├── analyze.ts      # Main analysis command (orchestrates metrics + scoring)
│   ├── context.ts      # Context file generation subcommands
│   ├── fix.ts          # Auto-fix command
│   └── init-ci.ts      # CI workflow generator
└── core/
    ├── types.ts        # Core types (SupportedLanguage, BTARConfig, etc.)
    ├── config.ts       # Config loading from .btar.yaml
    ├── detector.ts     # Language detection via marker files
    ├── scoring.ts      # Score calculation (30 type + 30 lint + 40 coverage)
    ├── progress.ts     # Terminal progress reporting
    ├── output.ts       # JSON output formatting
    ├── metrics/        # Metric measurement modules
    │   ├── index.ts    # runAllMetrics() orchestrator
    │   ├── types.ts    # MetricResult interface
    │   ├── runner.ts   # Shell command execution
    │   ├── type-checker.ts  # tsc, Pyrefly, go vet
    │   ├── linter.ts   # eslint, ruff, golangci-lint
    │   └── coverage.ts # Coverage parsing
    ├── context/        # Context file generators
    │   ├── agents-md.ts    # AGENTS.md validation/generation
    │   ├── pre-commit.ts   # Pre-commit config generation
    │   └── claude-hooks.ts # Claude Code hooks generation
    └── remediation/    # Fix and recommendation modules
        ├── index.ts    # Barrel export
        ├── fixer.ts    # Auto-fix execution
        ├── recommendations.ts  # Score-based recommendations
        └── ratchet.ts  # Baseline score management
```

## Key Patterns

**Scoring Formula**: Score = Type(30) + Lint(30) + Coverage(40)
- Type/lint use logarithmic decay: `maxPoints * (1 / (1 + log10(1 + errors)))`
- Coverage uses linear scaling: `(coverage / 100) * maxPoints`

**Language Detection**: Checks marker files (tsconfig.json, go.mod, pyproject.toml, etc.) with primary (high confidence) and secondary (medium confidence) markers. Special handling for package.json to distinguish TypeScript from JavaScript.

**Metric Flow**: `analyzeCommand` → `detectLanguages` → `runAllMetrics` → `calculateScore` → output

**Tests**: Co-located with source files (`*.test.ts`). Use vitest with standard assertions.

## Supported Languages

python, typescript, javascript, go, java, kotlin, swift, ruby, php

Each language maps to specific tools:
- Type checkers: tsc, Pyrefly, go vet
- Linters: eslint, ruff, golangci-lint
- Coverage: lcov parsing, SlipCover JSON
