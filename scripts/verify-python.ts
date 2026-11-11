import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { generatePythonToolchainConfig } from "../src/core/context/python-toolchain.js";

const directory = await mkdtemp(join(tmpdir(), "btar-python-verification-"));
const cli = resolve("dist/cli.js");
async function run(command: string[]): Promise<string> {
  const child = Bun.spawn(command, { cwd: directory, env: { ...process.env, HATCH_ENV_TYPE_VIRTUAL_PATH: join(directory, ".venv") }, stdout: "pipe", stderr: "inherit" });
  const stdout = await new Response(child.stdout).text();
  const status = await child.exited;
  if (status !== 0) throw new Error(`${command.join(" ")} failed with exit code ${status}\n${stdout}`);
  return stdout;
}
try {
  await writeFile(join(directory, "pyproject.toml"), generatePythonToolchainConfig());
  await writeFile(join(directory, "example.py"), "def double(value: int) -> int:\n    return value * 2\n");
  await mkdir(join(directory, "tests"));
  await writeFile(join(directory, "tests/test_example.py"), `from hypothesis import given
from hypothesis import strategies as st

from example import double


@given(st.integers())
def test_double(value: int) -> None:
    assert double(value) == value + value
`);
  const version = await run(["hatch", "run", "python", "--version"]);
  if (!/Python 3\.(?:14|1[5-9]|[2-9]\d)\./.test(version)) throw new Error(`Unexpected interpreter ${version}`);
  await run(["hatch", "run", "ruff", "format", "."]);
  const output = await run([process.execPath, cli, "analyze", ".", "--json", "--fail-under", "100"]);
  const report = JSON.parse(output);
  if (report.score !== 100) throw new Error(`Expected score 100, received ${output}`);
  await run(["git", "init", "--quiet"]);
  await run(["git", "add", "example.py", "tests", "pyproject.toml"]);
  await run(["git", "-c", "user.name=BTAR", "-c", "user.email=btar@example.invalid", "commit", "--quiet", "-m", "Verification fixture"]);
  await writeFile(join(directory, "example.py"), "def double(value: int) -> int:\n    return value + value\n");
  await run(["hatch", "run", "pytest", "--cov", "--cov-report=xml", "-q"]);
  await run(["hatch", "run", "diff-cover", "coverage.xml", "--compare-branch=HEAD", "--fail-under=100"]);
  await run(["hatch", "run", "semgrep", "scan", "--config", "p/python", "--error", "--strict"]);
  process.stdout.write(`${version.trim()}\nVerified the built Bun CLI, Hypothesis tests, changed-line coverage, and Semgrep Python scan.\n`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
