import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { generateCircleCiConfig } from "./init-ci.js";

describe("generateCircleCiConfig", () => {
  it("generates a Python 3.14 Hatch quality workflow", () => {
    const source = generateCircleCiConfig(80);
    const config = yaml.parse(source);
    expect(config.version).toBe(2.1);
    expect(config.workflows.quality.jobs).toEqual(expect.arrayContaining(["quality", "secrets"]));
    expect(config.jobs.quality.docker[0].image).toBe("cimg/python:3.14");
    expect(source).toContain("hatch run ruff check .");
    expect(source).toContain("hatch run pyrefly check");
    const commands = config.jobs.quality.steps.filter((step: unknown) => step !== null && typeof step === "object" && "run" in step).map((step: {run:{command:string}}) => step.run.command);
    const versionIndex = commands.findIndex((command: string) => command.includes("sys.version_info < (3, 14)"));
    expect(versionIndex).toBeGreaterThanOrEqual(0);
    expect(versionIndex).toBeLessThan(commands.findIndex((command: string) => command.includes("ruff check")));
    expect(source).toContain("hatch run pytest --cov");
    expect(source).toContain("hatch run diff-cover coverage.xml '--compare-branch=origin/main' --fail-under=80");
    expect(source).toContain("git fetch origin '+refs/heads/main:refs/remotes/origin/main'");
    expect(source).toContain("gitleaks_8.24.2_linux_x64.tar.gz");
    expect(source).toContain("fa0500f6b7e41d28791ebc680f5dd9899cd42b58629218a5f041efa899151a8e");
    expect(source).toContain("/tmp/gitleaks detect --source=. --no-banner");
    expect(source).toContain("semgrep scan --config p/python --error --strict");
    expect(source).not.toContain("npm install");
  });

  it("rejects an invalid changed-line coverage threshold", () => {
    expect(() => generateCircleCiConfig(101)).toThrow();
  });

  it("accepts a project-specific comparison branch", () => {
    expect(generateCircleCiConfig(90, "trunk")).toContain("'--compare-branch=origin/trunk' --fail-under=90");
  });

  it("rejects branch names that could alter the generated shell command", () => {
    expect(() => generateCircleCiConfig(80, "main; curl evil")).toThrow();
    expect(() => generateCircleCiConfig(80, "--upload-pack=evil")).toThrow();
  });
});

import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initCiCommand } from "./init-ci.js";
import { generatePythonToolchainConfig } from "../core/context/python-toolchain.js";

it("requires declared Hatch tools before writing a workflow", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-ci-"));
  try {
    writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "ruff pytest pyrefly semgrep diff-cover pytest-cov"\n');
    await initCiCommand({ directory: root });
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(false);
    process.exitCode = 0;
    writeFileSync(join(root, "pyproject.toml"), generatePythonToolchainConfig());
    await initCiCommand({ directory: root });
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(true);
  } finally { process.exitCode = 0; rmSync(root, { recursive: true, force: true }); }
});


it("preserves an existing workflow when forced generation lacks prerequisites", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-ci-existing-"));
  try {
    const directory = join(root, ".circleci");
    const { mkdirSync, readFileSync } = await import("node:fs");
    mkdirSync(directory);
    const destination = join(directory, "config.yml");
    writeFileSync(destination, "existing workflow");
    writeFileSync(join(root, "pyproject.toml"), "[invalid\n");
    await initCiCommand({ directory: root, force: true });
    expect(process.exitCode).toBe(1);
    expect(readFileSync(destination, "utf8")).toBe("existing workflow");
  } finally { process.exitCode = 0; rmSync(root, { recursive: true, force: true }); }
});

it("defaults to a 70 percent threshold", () => {
  expect(generateCircleCiConfig()).toContain("--fail-under=70");
});

it("matches Git branch validation and safely passes valid names to shell commands", async () => {
  const { spawnSync } = await import("node:child_process");
  const { mkdirSync, readFileSync } = await import("node:fs");
  const root = mkdtempSync(join(tmpdir(), "btar-branch-"));
  try {
    for (const name of ["feature/", ".hidden", "foo.lock", "feature/.hidden", "feature@name", "@", "main;touch-pwned", "main$variable", "main`whoami`", "$(whoami)", "quote'branch", "-option", "foo..bar", "foo bar", "foo@{bar", "HEAD"]) {
      const valid = spawnSync("git", ["check-ref-format", "--branch", name]).status === 0;
      if (!valid) { expect(() => generateCircleCiConfig(70, name), name).toThrow(); continue; }
      const config = yaml.parse(generateCircleCiConfig(70, name));
      const command = config.jobs.quality.steps.find((step: { run?: { name: string } }) => step.run?.name === "Check changed-line coverage").run.command;
      mkdirSync(join(root, "bin"), { recursive: true });
      writeFileSync(join(root, "bin/git"), '#!/bin/sh\nprintf "%s\\n" "$@" > git-args\n', { mode: 0o755 });
      writeFileSync(join(root, "bin/hatch"), '#!/bin/sh\nprintf "%s\\n" "$@" > hatch-args\n', { mode: 0o755 });
      const run = spawnSync("/bin/sh", ["-c", command], { cwd: root, env: { ...process.env, PATH: join(root, "bin") } });
      expect(run.status, name).toBe(0);
      expect(readFileSync(join(root, "git-args"), "utf8").split("\n")).toEqual(["fetch", "origin", `+refs/heads/${name}:refs/remotes/origin/${name}`, ""]);
      expect(readFileSync(join(root, "hatch-args"), "utf8").split("\n")).toContain(`--compare-branch=origin/${name}`);
      expect(existsSync(join(root, "pwned"))).toBe(false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});


it("rejects shadowed tools and accepts dependencies merged into hatch.toml", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-ci-hatch-"));
  try {
    writeFileSync(join(root, "pyproject.toml"), generatePythonToolchainConfig());
    writeFileSync(join(root, "hatch.toml"), '[envs.default]\ndependencies = []\n');
    await initCiCommand({ directory: root });
    expect(process.exitCode).toBe(1);
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(false);
    process.exitCode = 0;
    writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "existing"\n');
    writeFileSync(join(root, "hatch.toml"), '[envs.default]\nskip-install = true\ndependencies = ["pyrefly", "ruff", "pytest", "pytest-cov", "hypothesis", "semgrep", "diff-cover"]\n');
    await initCiCommand({ directory: root });
    expect(process.exitCode).toBe(0);
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(true);
  } finally { process.exitCode = 0; rmSync(root, { recursive: true, force: true }); }
});


it.each([
  { name: "unrelated standalone settings", hatch: '[build]\ndirectory = "build"\n', passes: true },
  { name: "a standalone non-default environment", hatch: '[envs.other]\ndependencies = []\n', passes: false },
  { name: "an empty standalone environments table", hatch: '[envs]\n', passes: false },
  { name: "a non-string standalone dependency", hatch: '[envs.default]\ndependencies = ["pyrefly", "ruff", "pytest", "pytest-cov", "hypothesis", "semgrep", "diff-cover", 123]\n', passes: false },
  { name: "malformed standalone TOML", hatch: '[envs.default\n', passes: false },
])("validates effective Hatch dependencies with $name", async ({ hatch, passes }) => {
  const root = mkdtempSync(join(tmpdir(), "btar-ci-precedence-"));
  try {
    process.exitCode = 0;
    writeFileSync(join(root, "pyproject.toml"), generatePythonToolchainConfig());
    writeFileSync(join(root, "hatch.toml"), hatch);
    await initCiCommand({ directory: root });
    expect(process.exitCode).toBe(passes ? 0 : 1);
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(passes);
  } finally { process.exitCode = 0; rmSync(root, { recursive: true, force: true }); }
});

it("accepts standalone Hatch tools without pyproject metadata", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-ci-standalone-"));
  try {
    process.exitCode = 0;
    writeFileSync(join(root, "hatch.toml"), '[envs.default]\nskip-install = true\ndependencies = ["pyrefly", "ruff", "pytest", "pytest-cov", "hypothesis", "semgrep", "diff-cover"]\n');
    await initCiCommand({ directory: root });
    expect(process.exitCode).toBe(0);
    expect(existsSync(join(root, ".circleci/config.yml"))).toBe(true);
  } finally { process.exitCode = 0; rmSync(root, { recursive: true, force: true }); }
});
