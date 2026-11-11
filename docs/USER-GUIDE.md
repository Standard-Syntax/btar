# BTAR User Guide

## Transform Your Codebase for the Age of AI Agents

BTAR (Brownfield-to-Agent-Ready) measures and improves how effectively AI coding agents can operate in your codebase. This guide teaches both the *how* and the *why*—because understanding the principles makes the tool more powerful.

---

## Part 1: The Problem

### Why AI Agents Fail in Legacy Codebases

You've tried using Claude, Copilot, or Cursor on your production codebase. Sometimes it works brilliantly. Other times, the AI generates code that:

- Breaks type checking you didn't know existed
- Introduces lint violations that fail CI
- Works in isolation but breaks integration tests
- Looks correct but contains subtle logic errors

The common assumption: *"The AI isn't smart enough yet."*

The reality: **Your codebase lacks the verification infrastructure to catch AI mistakes.**

AI agents can only reliably modify code they can *verify*. A codebase without strict types, comprehensive linting, and good test coverage is like asking someone to edit a document in a language they don't speak, with no spell-checker, and no way to know if the meaning changed.

### The Verifier's Rule

Google AI researcher Jason Wei formalized this insight:

> "The ease of training AI to solve a task is proportional to how verifiable the task is."

This isn't just about training—it applies to all AI code generation. When Claude writes code:

1. If types catch errors → Claude sees the error, fixes it, tries again
2. If linter catches issues → Claude sees the violation, adjusts
3. If tests fail → Claude knows the code is wrong
4. If nothing catches errors → Claude has no signal, ships broken code

**The bottleneck isn't AI capability. It's verification quality.**

Andrej Karpathy (Tesla AI, OpenAI) captured this perfectly:

> "Software 1.0 automates what you can specify. Software 2.0 automates what you can verify."

### The Five Properties of Verifiable Code

Wei identifies five properties that make code AI-friendly:

| Property | Definition | How BTAR Measures It |
|----------|------------|---------------------|
| **Objective truth** | Everyone agrees what "correct" means | Type errors = 0, Lint errors = 0 |
| **Fast to verify** | Feedback in seconds, not minutes | CI time, pre-commit hooks |
| **Scalable to verify** | Can check many solutions quickly | Parallelized tests |
| **Low noise** | Verification correlates with quality | Low flaky test rate |
| **Continuous reward** | Can rank "better" vs "worse" | Coverage %, error counts |

Your codebase's **verification ceiling** determines how effectively AI can operate. BTAR measures that ceiling.

---

## Part 2: Understanding Agent-Readiness

### What Makes Code "Agent-Ready"?

Agent-ready code has three properties:

1. **Fast feedback loops**: The AI knows within seconds if its code is wrong
2. **Binary signals**: Pass/fail, not "maybe" or "it depends"
3. **Comprehensive coverage**: No dark corners where errors hide

### The BTAR Score

BTAR produces a 0-100 **Agent-Readiness Score** based on three dimensions:

| Dimension | Max Points | What It Measures |
|-----------|------------|------------------|
| Type Strictness | 30 | Compile-time error detection |
| Lint Errors | 30 | Code quality enforcement |
| Test Coverage | 40 | Runtime verification |

**Why these weights?**

- **Types (30 points)**: Catch 73% of configuration errors before code even runs. Types are the fastest feedback loop—milliseconds.
- **Lint (30 points)**: Enforce consistent patterns. When code follows patterns, AI can learn and apply them. Zero tolerance creates a binary signal.
- **Coverage (40 points)**: Tests verify behavior. High coverage means AI-generated code gets validated against actual requirements. This is weighted highest because it's the ultimate verification—does the code *work*?

### Score Interpretation

| Score | Rating | What It Means |
|-------|--------|---------------|
| 90-100 | Excellent | AI agents can operate autonomously with high confidence |
| 70-89 | Good | AI effective with occasional human review |
| 50-69 | Needs Work | Significant gaps create blind spots for AI |
| 0-49 | Poor | Major infrastructure investment needed before AI is reliable |

### The Logarithmic Decay Model

BTAR uses logarithmic decay for error-based metrics:

```
points = maxPoints × (1 / (1 + log₁₀(1 + errors)))
```

This creates diminishing returns:

| Errors | Points (out of 30) | Interpretation |
|--------|-------------------|----------------|
| 0 | 30 | Perfect—binary pass signal |
| 1 | ~22 | One error is much worse than zero |
| 10 | ~15 | Significant quality issues |
| 100 | ~10 | Systemic problems |
| 1000 | ~7 | Foundational work needed |

**Why logarithmic?** The difference between 0 and 1 error is huge (binary signal vs. noise). The difference between 100 and 101 errors is negligible. Logarithmic decay captures this reality.

---

## Part 3: Getting Started

### Installation

```bash
npm install -g btar
```

Requires Node.js 18+.

### Your First Analysis

```bash
cd /path/to/your/project
btar analyze .
```

Output:
```
Analyzing /path/to/your/project...
✓ Found: typescript, python

Metrics:
Type Strictness
  typescript (tsc): 47 errors ✗
  python (pyrefly): 0 errors ✓
Lint Errors
  typescript (eslint): 23 errors ✗
  python (ruff): 0 errors ✓
Test Coverage
  typescript (lcov): 62% ✗
  python (slipcover): 84% ✓

Summary:
  Type errors: 47
  Lint errors: 23
  Coverage: 73%
  Score: 58/100 (needs-work)

Recommendations:
  P0: Fix 47 type errors. Type safety is critical for AI agent reliability.
  P1: Fix 23 lint errors. Clean code is easier for AI agents to modify. (run: npx eslint --fix .)
  P2: Improve test coverage from 73% to 80%+ for better verification.
```

### Understanding the Output

**Languages detected**: BTAR auto-detects languages via marker files (tsconfig.json, pyproject.toml, go.mod, etc.).

**Metrics per language**: Each language is measured independently with appropriate tools:
- TypeScript: `tsc --noEmit`, `eslint`, lcov
- Python 3.14: `pyrefly check`, Ruff, SlipCover JSON

**Recommendations**: Prioritized actions based on your score tier.

### JSON Output for Automation

```bash
btar analyze . --json
```

Returns structured data for CI systems, dashboards, or custom tooling.

---

## Part 4: The Remediation Path

BTAR doesn't just measure—it guides you toward agent-readiness.

### Step 1: Understand Your Priorities

Recommendations are tiered:

| Tier | Meaning | Action |
|------|---------|--------|
| P0 | Critical blocker | Fix immediately—AI can't work reliably without this |
| P1 | High impact | Fix soon—significant improvement to AI effectiveness |
| P2 | Moderate impact | Fix when possible—noticeable improvement |
| P3 | Optional | Nice to have—polish for excellent tier |

**Priority logic by score tier:**

- **Poor (<50)**: Focus on types first (P0), then lint (P1). Coverage is P3—deferred until foundation exists.
- **Needs Work (50-69)**: Types and lint are P0-P1. Coverage becomes P2.
- **Good (70-89)**: Remaining errors are P1. Coverage optimization is P2-P3.
- **Excellent (90+)**: Everything is P2-P3 polish.

### Step 2: Auto-Fix What's Fixable

```bash
btar fix .
```

This runs language-specific formatters and linters with `--fix` flags:

| Language | Tool | Command |
|----------|------|---------|
| TypeScript/JS | eslint | `npx eslint . --fix` |
| Python | ruff | `ruff check . --fix` |
| Go | gofmt | `gofmt -w .` |
| Swift | swiftformat | `swiftformat .` |
| Kotlin | ktlint | `ktlint --format` |
| Ruby | rubocop | `rubocop --autocorrect` |
| PHP | php-cs-fixer | `php-cs-fixer fix .` |
| Java | google-java-format | `google-java-format --replace` |

**What auto-fix handles:**
- Formatting issues (indentation, spacing, line length)
- Simple lint violations (unused imports, missing semicolons)
- Style inconsistencies

**What auto-fix cannot handle:**
- Type errors (require code logic changes)
- Complex lint violations (require architectural decisions)
- Missing tests (require understanding requirements)

### Step 3: Fix Type Errors Manually

Type errors require human judgment. Common patterns:

```typescript
// Before: implicit any
function process(data) { ... }

// After: explicit types
function process(data: ProcessInput): ProcessOutput { ... }
```

```python
# Before: untyped
def calculate(items):
    return sum(item.value for item in items)

# After: typed
def calculate(items: list[Item]) -> float:
    return sum(item.value for item in items)
```

**Pro tip**: Start with public APIs. Internal functions can use type inference.

### Step 4: Improve Test Coverage

Coverage below 70% indicates significant blind spots. Strategies:

1. **Cover critical paths first**: What breaks the business if it fails?
2. **Test edge cases**: Empty inputs, nulls, boundary conditions
3. **Avoid mocking core logic**: Mocks hide real behavior from verification

```bash
# See what's uncovered
python -m slipcover --source src -m pytest -q
npm test -- --coverage
```

### Step 5: Establish a Baseline

Once you've made improvements:

```bash
btar analyze . --save-baseline
```

This creates `.btar-score`:
```json
{
  "score": 72,
  "timestamp": "2024-01-15T10:30:00Z",
  "breakdown": {
    "typeStrictness": 25,
    "lintErrors": 22,
    "coverage": 25
  }
}
```

**Commit this file.** It becomes your quality floor.

### Step 6: Enable Ratchet Mode

In CI, prevent regressions:

```bash
btar analyze . --ratchet
```

- Score >= baseline → CI passes
- Score < baseline → CI fails with detailed regression info

```
✗ Score regression: 68 < 72 (-4 points)
  Type strictness: 25 → 22 (-3)
  Lint errors: 22 → 22 (unchanged)
  Coverage: 25 → 24 (-1)
```

**The ratchet principle**: Quality only goes up. Every PR must maintain or improve the score. This prevents gradual degradation that accumulates into technical debt.

---

## Part 5: CI Integration

### CircleCI

Run the generator to create `.circleci/config.yml`:

```bash
btar init-ci --threshold 70
```

The generated CircleCI 2.1 job runs in `cimg/python:3.14-node`,
installs BTAR, and prepares Python projects with `uv sync --python 3.14`.
It writes a JSON report to `btar-report.json` and stores that report as
a CircleCI artifact.

For a Python project, declare the modern verification tools:

```bash
uv add --dev pyrefly ruff pytest slipcover
uv run --python 3.14 pyrefly check
uv run --python 3.14 ruff check .
uv run --python 3.14 python -m slipcover -m pytest -q
```

Connect the repository to CircleCI, then validate the workflow using
`circleci config validate .circleci/config.yml` and an actual pipeline.

### Quality Gates

Combine threshold and ratchet for robust enforcement:

```bash
btar analyze . --fail-under 70 --ratchet
```

- `--fail-under 70`: Absolute minimum (never ship below this)
- `--ratchet`: Relative minimum (never regress from baseline)

### PR Comments (Future Enhancement)

Currently BTAR outputs to stdout/JSON. Integration with PR comment bots is possible via JSON output parsing.

---

## Part 6: Claude Code Integration

BTAR integrates with Claude Code through two mechanisms:

### 1. Context Files (AGENTS.md)

Generate project context for AI agents:

```bash
btar context generate agents-md
```

Creates `AGENTS.md`:
```markdown
# my-project

This file provides context for AI coding agents.

## Languages

- **TypeScript** (high confidence)
- **Python** (high confidence)

## Build

```bash
npm run build
```

## Testing

```bash
npm test
```

## Code Style

```bash
npm run lint
```

### TypeScript

- Follow TypeScript strict mode conventions
- Use ESLint with TypeScript parser

### Python

- Follow PEP 8 style guide
- Use type hints where possible
```

Claude Code reads this file automatically, understanding how to build, test, and lint your project.

### 2. Claude Code Hooks

Generate real-time feedback hooks:

```bash
btar context generate hooks
```

Creates `.claude/settings.json`:
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          { "type": "command", "command": "npx tsc --noEmit --project \".\"" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|MultiEdit|Write",
        "hooks": [
          { "type": "command", "command": "btar analyze \".\" --json" }
        ]
      }
    ]
  }
}
```

**How this works:**

1. You ask Claude to implement a feature
2. Claude attempts to edit a file
3. **PreToolUse** runs `tsc --noEmit` → if types fail, edit is blocked
4. Claude adjusts until types pass
5. Edit succeeds
6. **PostToolUse** runs `btar analyze --json` → Claude sees score impact
7. If score dropped, Claude can self-correct

This creates a **feedback loop** where Claude experiences the consequences of its changes in real-time, without human intervention.

### 3. Pre-Commit Hooks

For local development:

```bash
btar context generate pre-commit
```

Creates `.pre-commit-config.yaml` with language-appropriate hooks that run before every commit.

---

## Part 7: Advanced Usage

### Configuration

Create `.btar.yaml` for project-specific settings:

```yaml
# Threshold targets (informational)
thresholds:
  type_strictness: 0
  lint_errors: 0
  test_coverage: 80
  ci_time: 300
  flaky_rate: 0.5

# Exclude paths from analysis
exclude:
  - node_modules/**
  - dist/**
  - vendor/**
  - "*.generated.*"
  - "**/*.test.ts"  # Exclude test files from coverage

# Restrict to specific languages (empty = auto-detect all)
languages: []
```

### Monorepo Support

BTAR scans immediate subdirectories for language markers:

```
my-monorepo/
├── frontend/
│   └── tsconfig.json  → TypeScript detected
├── backend/
│   └── pyproject.toml → Python detected
└── services/
    └── go.mod         → Go detected
```

Run from root:
```bash
btar analyze .
# Detects: typescript, python, go
```

### Custom Analysis

Filter by language:
```bash
btar fix . --language python  # Only fix Python
```

Quiet mode for scripts:
```bash
btar analyze . --quiet --json > report.json
```

Custom config path:
```bash
btar analyze . --config ./config/btar-prod.yaml
```

---

## Part 8: Troubleshooting

### "Tool not found" errors

BTAR delegates to language-specific tools. Install them:

```bash
# TypeScript
npm install -D typescript eslint

# Python
uv add --dev pyrefly ruff pytest slipcover

# Go
go install golang.org/x/tools/cmd/goimports@latest
go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
```

### Score seems wrong

Check which tools are being used:
```bash
btar analyze . --json | jq '.metrics'
```

Common issues:
- **Coverage showing 0%**: Ensure coverage reports exist (lcov.info, coverage.xml)
- **Type errors higher than expected**: BTAR uses strict mode (`--strict` flags)
- **Lint errors missing**: Ensure linter config exists (eslint.config.js, ruff.toml)

### Ratchet failing unexpectedly

Check the baseline:
```bash
cat .btar-score
```

Compare with current:
```bash
btar analyze . --json | jq '.score'
```

If baseline is stale, update it:
```bash
btar analyze . --save-baseline
```

---

## Part 9: The ROI of Agent-Readiness

### Measured Outcomes

Organizations investing in verification infrastructure report:

- **Qodo + Fortune 100 retailer**: 450,000 developer hours saved annually
- **Abstracta bank**: 32% production defect reduction, ~$310,000/quarter savings
- **VirtuosoQA enterprise**: 644-721% Year 1 ROI from test automation
- **Shopify TypeScript migration**: 73% of configuration errors caught at compile time

### The Compound Effect

Agent-readiness improvements compound:

1. **Better types** → AI makes fewer type errors → faster iterations
2. **Better linting** → AI follows patterns → more consistent code
3. **Better coverage** → AI changes get verified → fewer bugs ship
4. **Fewer bugs** → less firefighting → more time for improvements
5. **More improvements** → higher score → AI becomes more effective

### The Competitive Moat

As AI capabilities improve, the differentiator isn't "better AI"—everyone has access to the same models. The differentiator is **verification infrastructure**.

Organizations with high BTAR scores can:
- Deploy AI agents with confidence
- Ship faster with fewer defects
- Onboard new AI tools immediately (context files exist)
- Maintain quality as AI writes more code

Organizations with low BTAR scores:
- Spend time reviewing AI output manually
- Ship bugs that verification would have caught
- Struggle to adopt new AI tools (no infrastructure)
- Watch quality degrade as AI volume increases

---

## Part 10: Command Reference

### `btar analyze <directory>`

Analyze codebase and produce agent-readiness score.

| Flag | Description |
|------|-------------|
| `--json` | Output as JSON |
| `--quiet` | Suppress progress output |
| `--config <path>` | Custom config file |
| `--fail-under <n>` | Exit 1 if score below threshold |
| `--ratchet` | Exit 1 if score below baseline |
| `--save-baseline` | Save current score as new baseline |

### `btar fix <directory>`

Auto-fix lint issues.

| Flag | Description |
|------|-------------|
| `--quiet` | Suppress progress output |
| `--language <lang>` | Fix only specific language |

### `btar context validate [path]`

Validate AGENTS.md file.

### `btar context generate agents-md [directory]`

Generate AGENTS.md.

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output path |
| `-f, --force` | Overwrite existing |

### `btar context generate pre-commit [directory]`

Generate .pre-commit-config.yaml.

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output path |
| `-f, --force` | Overwrite existing |

### `btar context generate hooks [directory]`

Generate Claude Code hooks.

| Flag | Description |
|------|-------------|
| `-o, --output <path>` | Output path |
| `-f, --force` | Overwrite existing |
| `--no-pre` | Disable PreToolUse hooks |
| `--no-post` | Disable PostToolUse hooks |

### `btar init-ci`

Generate CircleCI configuration.

| Flag | Description |
|------|-------------|
| `-t, --threshold <n>` | Score threshold (default: 70) |
| `-f, --force` | Overwrite existing |

---

## Conclusion

BTAR operationalizes a simple insight: **AI agents are only as good as your verification infrastructure allows them to be.**

The path to agent-readiness:

1. **Measure**: `btar analyze .` → know your current state
2. **Fix**: `btar fix .` + manual type fixes → improve the score
3. **Lock**: `btar analyze . --save-baseline` → establish the floor
4. **Enforce**: `btar analyze . --ratchet` in CI → prevent regression
5. **Enable**: `btar context generate hooks` → real-time AI feedback

The future isn't developers writing more code. It's developers curating environments where AI agents can reliably produce senior-level code on the first attempt.

Your BTAR score is your readiness for that future.

---

## Further Reading

- [The Verifier's Rule](https://www.jasonwei.net/blog/asymmetry-of-verification-and-verifiers-law) - Jason Wei's research on AI verifiability
- [AGENTS.md Specification](https://agents.md/) - Linux Foundation standard for AI context
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices) - Anthropic's guidance
- [Trust But Verify Pattern](https://addyo.substack.com/p/the-trust-but-verify-pattern-for) - Addy Osmani on AI verification
