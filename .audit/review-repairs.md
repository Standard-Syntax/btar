# Review repair record

The owner requested a Python-only Python 3.14+ target and a Bun runtime. This review pass retains those requirements. The PR stack remains unmerged. Publication uses additive commits and a merge into the existing documentation child. No rebase or force-push is needed.

## Dispositions

| Comment | Result | Evidence |
| --- | --- | --- |
| 1 | Fixed. Each CLI analysis or fix requires explicit execution consent. No Hatch call occurs by default. | src/cli.test.ts and src/core/metrics/index.test.ts |
| 2 | Addressed. Bun is the intended runtime. The CLI gives an actionable error under Node, and runtime guidance documents Bun commands. | docs/runtime.md and review-evidence/node-runtime.txt |
| 3 | Dismissed. Restoring non-Python discovery conflicts with the owner's explicit Python-only requirement. | src/core/types.ts |
| 4 | Dismissed. Restoring non-Python metric maps conflicts with the same explicit scope. | src/core/metrics/type-checker.ts |
| 5 | Fixed. Each detected project retains its relative directory and build system. Tools execute there. | src/core/metrics/index.test.ts |
| 6 | Fixed. Recursive discovery retains nested project metadata alongside root scripts without duplicating ordinary source/test subdirectories. | src/core/detector.test.ts |
| 7 | Fixed. Empty detection produces the normal report with score zero and a failed requested gate. | src/cli.test.ts |
| 8 | Fixed. Baselines have a versioned Python analysis scope and canonical project set. Incompatible baselines require deliberate replacement. | src/core/remediation/ratchet.test.ts and src/cli.test.ts |
| 9 | Fixed. CI generation validates required Hatch dependencies without executing source code. Generated CI checks the selected Python interpreter. | src/commands/init-ci.test.ts |
| 10 | Fixed. POSIX process-group timeout cleanup works even after the direct child exits. Pipe closure bounds promise settlement for escaped descendants. | review-evidence/timeout-before.txt and review-evidence/timeout-after.txt |
| 11 | Fixed. Custom output parent directories are created. | src/commands/context.test.ts |
| 12 | Fixed. Existing setup.py or setup.cfg metadata produces a separate merge candidate. | src/commands/context.test.ts |
| 13 | Fixed. Documented alternative headings remain accepted. | src/core/context/agents-md.test.ts |
| 14 | Fixed. Invocation tests execute fake Hatch programs and inspect actual arguments, working directories, output handling, and timeouts. | src/core/metrics/coverage.test.ts, linter.test.ts, type-checker.test.ts, and src/core/remediation/fixer.test.ts |
| 15 | Fixed. CLI tests assert gateResult and distinguish a threshold failure from incomplete measurement. | src/cli.test.ts |
| 16 | Fixed. A successful Hatch result reporting Python 3.13 is rejected before measurement. | src/cli.test.ts and src/core/metrics/index.test.ts |
| 17 | Fixed. Generated TOML is parsed and its actual dependency array is checked. | src/core/context/python-toolchain.test.ts |
| 18 | Fixed. Parsed workflow jobs and pre-commit hook IDs must activate the scanners. | src/commands/init-ci.test.ts and src/core/context/pre-commit.test.ts |
| 19 | Fixed by the same heading-alias repair as comment 13. | src/core/context/agents-md.test.ts |
| 20 | Fixed. JSON and human diagnostics never copy subprocess raw output. Credential-sentinel tests cover analysis and fixes. | src/cli.test.ts and src/core/output.ts |

## Verification

- PASS. Typecheck, lint, build, and all 149 tests.
- PASS. Real Python 3.14.7 integration through the built Bun CLI, including Hypothesis, pytest-cov, diff-cover, and Semgrep.
- The recorded evidence does not establish CircleCI semantic validation of generated target configuration. Tests parsed the generated configuration and checked its scanner jobs. CircleCI semantic validation of that generated configuration is NOT_RUN in the recorded evidence.
- Measured implementation statement coverage is 49.96 percent. CLI subprocess runs are separate from unit instrumentation.
- An independent reviewer reproduced the parent-exits-first cleanup defect. The added regression failed before the correction and passed afterward.
- Windows process-tree cleanup is NOT_RUN. A deliberately escaped process may survive group cleanup; explicit consent is not a sandbox.
- Hosted checks must be evaluated separately at the published PR heads. The evidence here establishes local results only.

## Principles

Model the Domain introduced project identity, scoped baselines, and safe diagnostic categories. Fix Root Causes moved consent before execution and fixed descendant cleanup in the runner. Test Behavior, Not Implementation replaced constant-only assertions with observed invocations and gate-specific outcomes.
