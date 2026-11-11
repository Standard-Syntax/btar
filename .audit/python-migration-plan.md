# Python migration

- [x] Read the Principles section of poteto-mode.
- [x] Phase A: Frame.
- [x] Phase B: Design the workflow.
- [x] Phase C: Run the loop.
- [x] Replace target detection and metrics with Python-only Hatch tools.
- [x] Generate Python context, Hatch toolchain, and CircleCI configuration.
- [x] Move runtime, installation, and terminal presentation to Bun and Ink.
- [x] Replace stale instructions and document brownfield adoption.
- [x] Phase D: Keep the audit trail.
- [x] Phase E: Verify and hand back.

Done means local installation works without npm publication, CLI generators preserve existing files, generated guidance names only Python target tools, quality checks pass, and a disposable Python repository can be analyzed through the installed CLI. Hosted CI is distinct from local verification.

Throughput checkpoint: three independent ownership areas cover core, generators, and docs. The root owns runtime/frontend integration and verification. Reassess after their first test run instead of broadening scope.
