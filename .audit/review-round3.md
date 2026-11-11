# Remaining supplied review issues

This pass addresses the 17 supplied findings on the Python/Bun migration. The implementation commit is d38d9d520d8e51032022a4aee8f5dbcce21512ff. The stack remains open and unmerged. No rebase or force-push was used.

## Dispositions

| Supplied issue | Result and root cause | Evidence |
| --- | --- | --- |
| Clean Pyrefly assertion | Addressed. The direct parser test omitted the clean empty-diagnostics result. | src/core/metrics/type-checker.test.ts |
| Maintainer hygiene hooks | Addressed. Replacing the hook list removed independent protections. Generic hygiene and Prettier hooks now coexist with Bun checks. | round3-evidence/hygiene.txt and src/repository-hooks.test.ts |
| Hatch interpreter assertion | Addressed. The test checked the project requirement rather than the actual Hatch selector. | src/core/context/python-toolchain.test.ts |
| Exact generated hooks | Addressed. Token matches could not verify hook semantics. Parsed configuration is now compared with exact repository and hook definitions. | src/core/context/pre-commit.test.ts |
| CI checkout image | Fixed. The former oven/bun:1.4.4 image lacks Git. The replacement cimg/python:3.14.10 has Git and receives checksum-verified Bun 1.4.4. | round3-evidence/container.txt |
| Python CI integration | Fixed. The workflow did not schedule its existing integration script. A dedicated Python job now executes it. | .circleci/config.yml and src/ci-config.test.ts |
| Duplicate errors | Fixed. stderr and Ink both owned the same normal error. Normal mode now routes through Ink; quiet mode writes once to stderr. | round3-evidence/progress-before.txt and src/core/progress.test.ts |
| Windows chmod | Addressed. The build depended on a Unix executable. A filesystem helper now skips chmod on Windows. | scripts/make-cli-executable.ts and src/build-portability.test.ts |
| Claude hook tests | Addressed. Tests omitted independently selectable branches and pre-hook quoting. Branch, schema, formatting, and literal argument coverage is restored. | src/core/context/claude-hooks.test.ts |
| Legacy Pyrefly hook | Fixed. The generated root hook ignored the detected build system. It is emitted only for a root Hatch project. | src/core/context/pre-commit.test.ts |
| Git branch rules | Fixed. An incomplete whitelist rejected valid Git names and accepted invalid ones. Git-compatible validation and shell quoting are tested against Git and actual shell arguments. | src/commands/init-ci.test.ts |
| Default coverage threshold | Fixed. The generator default diverged from the CLI. Both now use 70. | src/commands/init-ci.test.ts |
| Universal hidden exclusion | Dismissed. On the pinned Bun 1.4.4 runtime, Glob.match already matches .hidden.py and nested hidden markers with **/*. The detector regression passed before any source change. | src/core/detector.test.ts |
| Missing Hatch diagnostic | Fixed. Exit 127 was mislabeled as missing Ruff. The safe diagnostic identifies Hatch and gives installation guidance. | src/core/remediation/fixer.test.ts and src/cli.test.ts |
| Empty coverage files | Fixed. The parser trusted totals without measured-file evidence. It now rejects missing, empty, or malformed files objects. | src/core/metrics/coverage.test.ts |
| MultiEdit trigger | Fixed. The maintainer matcher omitted an editing operation. | .claude/settings.json and src/repository-hooks.test.ts |
| Unreadable AGENTS.md | Fixed. A read error escaped the validation boundary. Read failures again produce the structured File not found result. | src/core/context/agents-md.test.ts |

## Verification

- PASS. Local build, lint, typecheck, and all 170 tests.
- PASS. Exact committed implementation tested from a Git archive in cimg/python:3.14.10, including Bun bootstrap, frozen dependency installation, build, lint, typecheck, all 170 tests, and Python integration.
- PASS. Real Python 3.14.7 host integration and Python 3.14.10 container integration use Hypothesis, pytest-cov, diff-cover, and Semgrep.
- PASS. circleci config validate .circleci/config.yml. Its actual output is retained in round3-evidence/circleci-validation.txt.
- PASS. Disposable pre-commit inputs establish that malformed YAML and large files fail, while whitespace, EOF, and JSON formatting are repaired.
- Measured implementation statement coverage is 51.04 percent. Subprocess checks are separate from instrumentation.
- Independent review reran 42 focused tests and found no blocker in the scoped repairs.
- Native Windows execution is NOT_RUN. The Windows permission branch is unit-tested; no Windows platform success is claimed.
- Hosted CI results remain separate from these local and container results.

Fix Root Causes guided the parser, CI executor, and output-owner repairs. Test Behavior, Not Implementation guided real shell arguments, schema assertions, and invalid-file fixtures. Prove It Works guided exact-commit container verification.
