# BTAR verification map

See [initial proof and coverage limits](../PROOF.md). Read [SKILL.md](../SKILL.md) for launch, doctor, harness functions, fixtures and cleanup. This index is the maintained user-path verification source. Start each feature with a fresh target unless stated otherwise.

| Feature | Entry points | Runtime |
| --- | --- | --- |
| [Context generation](context-generation.md) | Four `context generate` subcommands; `context validate` | Bun only |
| [CircleCI generation](circleci.md) | `init-ci`, threshold/base branch, refusal/force | Bun only |
| [Analysis](analysis.md) | Human output, JSON, threshold, consent refusal | Real Hatch/Python 3.14+ |
| [Baselines](baselines.md) | Save, ratchet, missing/incompatible baseline | Real Hatch/Python 3.14+ |
| [Lint fixes](fix.md) | `fix`, language filter, consent refusal | Real Hatch/Ruff |

Baseline preconditions: cleanly built CLI, successful doctor, owned empty target, unique persistent evidence directory. Python journeys use the exact seed in Launch. Trust applies only to this generated fixture; do not add `--trust-project` to unknown repositories.

Capture action plus outcome: commands, both output streams, exit codes, and persisted files. Parse JSON and inspect stored values separately. Preserve proof through cleanup. Record every attempted entry point as PASS, FAIL, NOT_RUN or BLOCKED; one entry point cannot stand in for another. Seed gaps must produce a failure or explicit blocker, never a weakened journey. The initial generation proof is not full-map coverage.
