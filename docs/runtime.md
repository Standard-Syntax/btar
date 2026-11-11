# Execute a Python analysis

BTAR requires Bun 1.4.4 or newer. Its implementation remains TypeScript. Build and run it with Bun.

```bash
bun install --frozen-lockfile
bun run build
bun dist/cli.js analyze /path/to/project --trust-project
```

## Execution consent

Detection reads project files. Analysis and fixes run Hatch, repository configuration, plugins, and tests. Those programs execute with your user privileges. BTAR does not sandbox them.

BTAR requires `--trust-project` for each analysis or fix invocation. Add that flag only after deciding the repository and its dependencies are trusted. Without it, BTAR analysis and fix commands do not invoke Hatch or pytest.

Generated Claude hooks require `btar` on the hook's PATH. The generated post-edit analysis omits `--trust-project`, so it fails until you explicitly add that flag to the generated command. The generated pre-edit hook runs `hatch run pyrefly check` directly and does not use BTAR's consent check. Review both hooks and enable them only for a trusted repository.

```bash
bun dist/cli.js analyze /path/to/project --trust-project --json --fail-under 80
bun dist/cli.js fix /path/to/project --trust-project
```

Reports include safe failure categories. Raw subprocess output is not copied into JSON or terminal errors. Run individual tools directly in a trusted environment when you need their full diagnostics.

## Python projects and baselines

Detection searches eligible directories recursively and prunes common environment and cache directories. It selects the outermost project directory when that directory has a project marker or a standalone Python script. Nested projects beneath it do not receive separate Hatch runs. Sibling projects are detected separately and run in their own directories. A script-only legacy root also prevents separate detection of nested Hatch projects, and its own metrics remain unsupported. Root metrics retain the `python` key. Nested metrics use keys such as `python:packages/example`, and each detected entry includes `projectPath` relative to the analysis root.

A baseline records the Python scoring scope and the discovered project set. Legacy baselines and changed project sets are rejected. Inspect the new report before deliberately replacing a baseline with `--save-baseline`.

## Generate CI

First generate the Python toolchain profile and merge its Hatch dependencies into the project's pyproject.toml. Existing pyproject.toml and legacy setup.py or setup.cfg metadata produce a separate merge candidate. Preserve the project's real packaging identity.

```bash
bun dist/cli.js context generate python-toolchain /path/to/project
bun dist/cli.js init-ci /path/to/project
```

`init-ci` checks the default Hatch dependency declarations without executing project code. It refuses to write a workflow when required tools are absent. Generated CI also checks that Hatch selects Python 3.14 or newer before running quality checks.

## Timeout boundaries

On POSIX systems BTAR terminates the spawned process group on timeout and closes its capture pipes so analysis settles. A process that deliberately escapes the group can survive. Windows cleanup is best effort. Descendants can survive when the Hatch wrapper exits before timeout. Windows process-tree cleanup has not been verified in this run.

## Generated pre-commit hooks

The generated root Pyrefly hook uses Hatch only when the repository root is detected as a Hatch project. Legacy Python repositories and repositories containing only nested Hatch projects omit that root hook. Adopt and configure Hatch before adding a root Hatch typecheck hook. Ruff and security hooks remain available for legacy repositories.
