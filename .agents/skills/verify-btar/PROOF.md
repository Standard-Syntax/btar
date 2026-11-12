# Verification proof

## Current review fixes

Verified on Linux with Bun 1.4.4 at revision `c5bea7b7c64d0b5baa379bafe354b5d4cb39b1bb`, with these fixes in the working tree. No app implementation files changed.

| Journey | Result | Evidence |
| --- | --- | --- |
| Context generation | PASS | `$BTAR_STORE/run-review-generation-c3dk4ise` |
| Python analysis, consent, terminal, JSON, and threshold | PASS | `$BTAR_STORE/run-aXh7Hddq` |
| Baseline save and stable ratchet | PASS | `$BTAR_STORE/run-aXh7Hddq` |
| Remaining baseline actions and lint fixes | NOT_RUN | Outside this verification pass |

Both evidence directories retain the helper source and SHA-256 `347a4374d53e8dc79c3737b2ca1221af58d3d76b3e95069282efab17b821236b`. Generation records status and cleanup PASS. The analysis target was removed after proof was copied. Clean analysis scored 100 with successful type, lint, and coverage metrics. An unused import lowered the score to 90 and failed the threshold. The coverage metric is retained in the command report. BTAR removes its temporary coverage JSON.

The seed runs Ruff import fixes, formatting, and a clean lint check before analysis. Ruff 0.17.4 requires the separate Hypothesis imports in this toolchain. Combining them reproduced I001.

All 17 helper and manual-cleanup tests passed. They cover SIGTERM through pipes and a PTY, literal metacharacters, launch failure evidence, cleanup failure after successful generation, both journey and cleanup failures, a failed target-path evidence write, mutable target variables, replacement directories, and symlinks. Build, typecheck, lint, and all 185 repository tests passed. Skill frontmatter, local links, and Bash syntax were checked.

The subprocess audit found direct argv execution with `shell=False` as the Python default. Capture intentionally runs the command supplied by the operator. Arguments are not shell source and require no `shlex.escape` transformation. Generated hook matchers and command strings were checked as data. Hooks were not executed, and hosted CI was not run.

## Earlier verification

The final helper was exercised on Linux with Bun 1.4.4 against the built CLI from revision `37c2a66933a47473f4bfd0d7a23cec8e9675a854`, with these review fixes in the working tree. Install and build succeeded. No app implementation files changed.

The generation and capture runs below used helper SHA-256 `9d9281bf9716b8d3113d3b26a687ac6feb5ba8bef444ab407593c462567fd918`. Each stores the digest in `control.sha256`, alongside doctor identity, build-input hashes and per-action command metadata. `$BTAR_STORE` is the persistent evidence directory defined in Launch.

| Journey | Result | Evidence |
| --- | --- | --- |
| Context generation, final helper | PASS | `$BTAR_STORE/run-review-final-o6cZkD52` |
| CircleCI generation, final capture helper | PASS | `$BTAR_STORE/run-capture-review-ge2o37ae` |
| Python analysis | PARTIAL | `$BTAR_STORE/run-python-review-947l71yt` |
| Baselines | NOT_RUN | Recipe mapped |
| Lint fixes | NOT_RUN | Recipe mapped; source-copy and diff shell checks passed |

The final generation run includes install/build logs, before/after target trees, original hook settings and generated-file hashes. The capture run includes default and customized CircleCI workflows. Both have `result.json` with status and cleanup PASS. Every recorded exit matched its expected exit, including deliberate refusals. Their owned targets were confirmed absent after cleanup, while evidence remained present.

The Python analysis run used real Hatch tools and the complete documented seed. Hatch's Ruff 0.17.4 check passed. Clean analysis reported score 100 with a passed gate. After adding an unused import, analysis reported score 90 with a failed gate. Both reports contained successful type, lint and coverage measurements. The temporary coverage JSON was not retained in the target. This run used a separate piped subprocess driver, not the capture helper; its driver and stdout and stderr files are retained in the listed directory. Only the JSON and threshold assertions passed. The prescribed capture-helper journey, human terminal entry and consent refusal remain NOT_RUN. The analysis row is PARTIAL for that reason.

Earlier generation evidence remains at `$BTAR_STORE/run-oxfLMXzj` and its previous post-change re-run at `$BTAR_STORE/run-83Uhf2GF`. The earlier capture run remains at `$BTAR_STORE/run-ci-9qHGlpNy`. These are historical records; the final-helper rows above back the current generation and capture PASS claims.

Eight helper regression tests passed, including actual pipe and PTY timeout cases that verified parent and ordinary descendant PIDs were gone. The tests also verified a controlling terminal, separate JSON output, recorded environment overrides, exact command tokens and missing-input failures. Build, typecheck, lint and all 185 repository tests passed. Skill links, frontmatter and Bash block syntax were checked.

These runs used the actual local CLI on disposable directories, with no container or substitute runtime. Generated hooks were not executed, workflows were not submitted and no network trace was captured. Full-map coverage, live hooks, hosted CI and other operating systems remain unverified. Entry variants listed in feature Gotchas remain NOT_RUN unless explicitly covered above.

Evidence paths are local run records and may not exist on another machine. Re-run Launch to collect fresh proof there.
