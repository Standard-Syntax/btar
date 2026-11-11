# BTAR - Brownfield to Agent-Ready

Transform legacy codebases into environments where AI coding agents can operate effectively.

BTAR analyzes your codebase's **verification infrastructure**—type checking, linting, and test coverage—and produces an **Agent-Readiness Score** (0-100). Based on [Jason Wei's Verifier's Rule](https://www.jasonwei.net/blog/asymmetry-of-verification-and-verifiers-law): AI agent effectiveness is bounded by verification quality, not AI capability.

## Why This Matters

AI coding agents can only reliably modify code they can verify. A codebase with:
- **Strict type checking** catches 73% of configuration errors before deployment
- **Zero lint errors** provides binary pass/fail feedback
- **High test coverage** validates AI-generated changes automatically

Organizations with strong verification infrastructure see 300-700% ROI on AI tooling. Those relying on AI capability alone hit diminishing returns quickly.

## Installation

```bash
npm install -g btar
```

Requires Node.js 18+.

## Quick Start

```bash
# Analyze current directory
btar analyze .

# Get JSON output for CI integration
btar analyze . --json

# Fail CI if score below threshold
btar analyze . --fail-under 70
```

## Commands

### `btar analyze <directory>`

Analyzes a codebase and produces an agent-readiness score.

```bash
btar analyze .                          # Basic analysis
btar analyze . --json                   # JSON output
btar analyze . --quiet                  # Suppress progress output
btar analyze . --fail-under 70          # Exit 1 if score < 70
btar analyze . --ratchet                # Fail if score regresses from baseline
btar analyze . --save-baseline          # Save current score as baseline
btar analyze . --config ./custom.yaml   # Use custom config file
```

**Output Example:**
```
Analyzing /path/to/project...
✓ Found: typescript

Metrics:
Type Strictness
  typescript (tsc): 0 errors ✓
Lint Errors
  typescript (eslint): 3 errors ✗
Test Coverage
  typescript (lcov): 78% ✓

Summary:
  Type errors: 0
  Lint errors: 3
  Coverage: 78%
  Score: 83/100 (good)

Recommendations:
  P1: Fix 3 lint errors to improve code quality. (run: npx eslint --fix .)
```

### `btar fix <directory>`

Auto-fixes lint issues across all detected languages.

```bash
btar fix .                    # Fix all languages
btar fix . --language python  # Fix only Python
btar fix . --quiet            # Suppress progress output
```

### `btar context validate [path]`

Validates an AGENTS.md file for completeness.

```bash
btar context validate              # Validates ./AGENTS.md
btar context validate ./docs/AGENTS.md
```

### `btar context generate agents-md [directory]`

Generates an AGENTS.md file with detected build/test/lint commands.

```bash
btar context generate agents-md           # Generate in current dir
btar context generate agents-md . -o ./docs/AGENTS.md
btar context generate agents-md . --force # Overwrite existing
```

### `btar context generate pre-commit [directory]`

Generates a `.pre-commit-config.yaml` with language-appropriate hooks.

```bash
btar context generate pre-commit
btar context generate pre-commit . -o ./config/.pre-commit-config.yaml
```

### `btar context generate hooks [directory]`

Generates Claude Code hooks configuration (`.claude/settings.json`).

```bash
btar context generate hooks           # Generate with all hooks
btar context generate hooks --no-pre  # Disable pre-tool hooks
btar context generate hooks --no-post # Disable post-tool hooks
```

### `btar init-ci`

Generates a CircleCI configuration for automated BTAR analysis.

```bash
btar init-ci                  # Default threshold: 70
btar init-ci --threshold 80   # Custom threshold
btar init-ci --force          # Overwrite existing workflow
```

## Scoring Methodology

BTAR uses a **Foundation Tier** scoring model focused on the three metrics that most impact AI agent effectiveness:

| Dimension | Max Points | Calculation |
|-----------|------------|-------------|
| Type Strictness | 30 | Logarithmic decay from errors |
| Lint Errors | 30 | Logarithmic decay from errors |
| Test Coverage | 40 | Linear scaling (coverage %) |

**Logarithmic Decay Formula:** `maxPoints * (1 / (1 + log10(1 + errors)))`
- 0 errors → 100% of max points
- 1 error → ~75% of max
- 10 errors → ~50% of max
- 100 errors → ~33% of max

**Score Interpretation:**
| Score | Rating | Meaning |
|-------|--------|---------|
| 90-100 | Excellent | High-confidence autonomous agent operation |
| 70-89 | Good | Effective with occasional human review |
| 50-69 | Needs Work | Significant gaps create agent blind spots |
| 0-49 | Poor | Major infrastructure investment needed |

## Configuration

Create a `.btar.yaml` file in your project root:

```yaml
# Threshold targets (for documentation/recommendations)
thresholds:
  type_strictness: 0      # Target: 0 type errors
  lint_errors: 0          # Target: 0 lint errors
  test_coverage: 70       # Target: 70% coverage
  ci_time: 600            # Target: CI < 10 minutes
  flaky_rate: 1           # Target: < 1% flaky tests

# Paths to exclude from analysis
exclude:
  - node_modules/**
  - dist/**
  - vendor/**
  - "*.generated.*"

# Restrict analysis to specific languages (empty = auto-detect)
languages: []
```

## Supported Languages

| Language | Type Checker | Linter | Coverage |
|----------|--------------|--------|----------|
| TypeScript | `tsc --noEmit` | `eslint` | lcov |
| JavaScript | — | `eslint` | lcov |
| Python 3.14 | `pyrefly check` | `ruff` | SlipCover JSON |
| Go | `go vet` | `golangci-lint` | go test -cover |
| Java | — | `checkstyle` | jacoco |
| Kotlin | — | `ktlint` | jacoco |
| Swift | Swift compiler | `swiftlint` | Xcode |
| Ruby | — | `rubocop` | simplecov |
| PHP | — | `phpcs` | phpunit |

Languages are auto-detected via marker files:
- **TypeScript**: `tsconfig.json` or `package.json` with typescript dependency
- **Python**: `pyproject.toml`, `setup.py`
- **Go**: `go.mod`
- **Java**: `pom.xml`, `build.gradle`
- And more...

## CI Integration

### CircleCI

Generate `.circleci/config.yml` automatically:

```bash
btar init-ci --threshold 70
```

The generated CircleCI 2.1 workflow uses a Python 3.14 + Node.js image,
installs BTAR, runs its readiness gate, and saves `btar-report.json` as an
artifact. Python projects with `pyproject.toml` are prepared using
`uv sync --python 3.14`. Declare project verification dependencies first:

```bash
uv add --dev pyrefly ruff pytest slipcover
```

BTAR's own repository uses CircleCI to run the TypeScript build, type
checks, lint checks, tests, and its existing readiness ratchet.

### Ratchet Mode

Prevent score regressions in CI:

```bash
# First, save a baseline
btar analyze . --save-baseline

# In CI, enforce no regression
btar analyze . --ratchet
```

This creates a `.btar-score` file that should be committed to your repository.

## Recommendations Engine

BTAR generates prioritized recommendations based on your score tier:

**Priority Levels:**
- **P0**: Critical blockers for agent effectiveness
- **P1**: High-impact improvements
- **P2**: Moderate improvements
- **P3**: Optional enhancements

**Example Recommendations:**
```
Score: 45/100 (poor)

Recommendations:
  P0: Fix 127 type errors. Type safety is critical for AI agent reliability.
  P1: Fix 43 lint errors. Clean code is easier for AI agents to modify. (run: ruff check --fix .)
  P3: Add test coverage after fixing type and lint errors.
```

## Development

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Run single test file
npx vitest run src/core/scoring.test.ts
```

## Theory: The Verifier's Rule

BTAR is grounded in [Jason Wei's research](https://www.jasonwei.net/blog/asymmetry-of-verification-and-verifiers-law):

> "The ease of training AI to solve a task is proportional to how verifiable the task is."

The five properties of high verifiability:
1. **Objective truth** → Tests pass, types check, linter clean
2. **Fast to verify** → Fast CI, pre-commit hooks
3. **Scalable to verify** → Parallelized test suites
4. **Low noise** → Low flaky test rate
5. **Continuous reward** → Coverage metrics, mutation scores

Your codebase's "verification ceiling" determines how effectively AI agents can operate. Investing in verification infrastructure yields compounding returns as AI capabilities improve.

## Related Resources

- [Agent Readiness Whitepaper](./agent-readiness-claude.md) - Deep dive on verification infrastructure
- [Scoring Rubric](./agent-readiness-scoring-rubric.md) - Comprehensive 100-point assessment framework
- [AGENTS.md Specification](https://agents.md/) - Linux Foundation standard for AI agent context
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)

## License

MIT
