# Initial verification proof

Executed on Linux with Bun 1.4.4 against the built CLI from revision `4213aa4ec3531d44a9c7b9b87d07ac63b4232b70`. The skill/helper were uncommitted additions. Install and build succeeded. No app implementation files changed.

| Journey | Result | Evidence |
| --- | --- | --- |
| Context generation | PASS | `/home/dscv/.local/state/btar-verification/run-oxfLMXzj` |
| CircleCI generation | PASS | `/home/dscv/.local/state/btar-verification/run-ci-9qHGlpNy` |
| Python analysis | NOT_RUN | Recipe mapped; real Hatch measurements not exercised in this run |
| Baselines | NOT_RUN | Recipe mapped |
| Lint fixes | NOT_RUN | Recipe mapped |

Both evidence directories contain `result.json`, doctor output, build-input hashes and per-action command metadata/stdout/stderr. Generation includes install/build logs, before/after target trees, original hook settings and generated-file hashes. CircleCI includes both default and customized workflow files. Every recorded exit matched its expected exit, including deliberate refusals. Both owned target paths in `target.txt` were confirmed absent after cleanup; proof files were confirmed present afterward.

The generation helper was run again after its last executable change. The manual capture helper was exercised through the CircleCI feature recipe. Skill links, four-section feature structure, helper executable permission and Python syntax were checked.

These runs used the actual local CLI on disposable directories, with no container or substitute runtime. Fixture setup consisted of an empty directory and real CLI-generated toolchain declarations. No target tools were installed, generated hooks executed, workflows submitted, or network trace captured. These proofs establish generated artifacts and CLI refusal behavior only. Full-map coverage, real Python tool execution, live hooks, hosted CI and other operating systems remain unverified. Some entry variants listed in feature Gotchas also remain NOT_RUN.

Evidence paths are local run records and may not exist on another machine. Re-run Launch to collect fresh proof there.
