# btar

BTAR is a Bun-run TypeScript CLI that prepares Python 3.14+ brownfield repositories for agent work.

## Implementation commands

```bash
bun install --frozen-lockfile
bun run build
bun run typecheck
bun run lint
bun run test
```

## Target profile

BTAR supports Python repositories only. Target projects use Hatch with Pyrefly, Ruff, pytest, pytest-cov, Hypothesis, Gitleaks, Semgrep, diff-cover, and CircleCI.

## Code search policy

Choose the search tool according to the question:

1. Use Probe MCP for conceptual repository exploration, symbol relationships, and complete implementation context when available. Probe MCP is optional. Fall back to focused `rg` searches when it is unavailable.
2. Use `ast-grep` for syntax-aware structural questions and rewrites when available. It is optional. Fall back to focused `rg` searches when it is unavailable. Invoke it as `ast-grep`, quote patterns containing `$` with single quotes, and search before rewriting.
3. Use `rg` for literal text, filenames, configuration values, comments, documentation, and generated text.

When using `rg` for structural questions, read each matching implementation to verify its scope before editing.

Search before reading large files. Begin with focused queries and broaden only when needed.

## TypeScript

Follow strict TypeScript conventions. Parse external values at boundaries. Keep JSON CLI output free of terminal rendering.
