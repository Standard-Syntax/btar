# Execute a Python analysis

BTAR requires Bun 1.4.4 or newer. Its implementation remains TypeScript. Build and run it with Bun.

```bash
bun install --frozen-lockfile
bun run build
bun dist/cli.js analyze /path/to/project --trust-project
```

## Execution consent

Detection reads project files. Analysis and fixes run Hatch, repository configuration, plugins, and tests. Those programs execute with your user privileges. BTAR does not sandbox them.

BTAR requires `--trust-project` for each analysis or fix invocation. Add that flag only after deciding the repository and its dependencies are trusted. Without it, BTAR does not invoke Hatch or pytest. Generated Claude hooks explicitly include the flag and are appropriate only for trusted repositories.

```bash
btar analyze /path/to/project --trust-project --json --fail-under 80
btar fix /path/to/project --trust-project
```

Reports include safe failure categories. Raw subprocess output is not copied into JSON or terminal errors. Run individual tools directly in a trusted environment when you need their full diagnostics.

## Python projects and baselines

Detection searches eligible directories recursively. Each discovered project runs in its own directory. Root metrics retain the `python` key. Nested metrics use keys such as `python:packages/example`, and each detected entry includes `projectPath` relative to the analysis root.

A baseline records the Python scoring scope and the discovered project set. Legacy baselines and changed project sets are rejected. Inspect the new report before deliberately replacing a baseline with `--save-baseline`.

## Generate CI

First generate the Python toolchain profile and merge its Hatch dependencies into the project's pyproject.toml. Existing pyproject.toml and legacy setup.py or setup.cfg metadata produce a separate merge candidate. Preserve the project's real packaging identity.

```bash
btar context generate python-toolchain /path/to/project
btar init-ci /path/to/project
```

`init-ci` checks the default Hatch dependency declarations without executing project code. It refuses to write a workflow when required tools are absent. Generated CI also checks that Hatch selects Python 3.14 or newer before running quality checks.

## Timeout boundaries

On POSIX systems BTAR terminates the spawned process group on timeout and closes its capture pipes so analysis settles. A process that deliberately escapes the group can survive. The Windows process-tree cleanup path has not been verified in this run.
