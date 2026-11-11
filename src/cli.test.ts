import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const cli = resolve("src/cli.ts");
const bun = Bun.which("bun")!;
function repository(python = true): string {
  const root = mkdtempSync(join(tmpdir(), "btar-cli-"));
  roots.push(root);
  if (python) writeFileSync(join(root, "example.py"), "answer: int = 42\n");
  return root;
}
function run(args: string[], cwd: string, env = process.env): ReturnType<typeof spawnSync> {
  return spawnSync(bun, [cli, ...args], { cwd, env, encoding: "utf8", timeout: 20_000 });
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

describe("local Bun CLI", () => {
  it("prints help without project dependencies", () => {
    const result = run(["--help"], repository(false));
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Python 3.14+");
  });
  it("reports unavailable Python measurements as failed JSON", () => {
    const result = run(["analyze", ".", "--json"], repository(), { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    const report = JSON.parse(String(result.stdout));
    expect(report.languages).toEqual([expect.objectContaining({ language: "python" })]);
    expect(String(result.stdout)).not.toContain("Python readiness");
    expect(String(result.stderr)).toContain("incomplete");
  });
  it("does not satisfy a score gate without a Python project", () => {
    const result = run(["analyze", ".", "--json", "--fail-under", "1"], repository(false));
    expect(result.status).toBe(1);
    expect(() => JSON.parse(String(result.stdout))).not.toThrow();
  });
  it("rejects malformed thresholds before running tools", () => {
    const result = run(["analyze", ".", "--fail-under", "70garbage"], repository());
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("integer between 0 and 100");
  });
  it("does not save a baseline from failed measurements", () => {
    const root = repository();
    const result = run(["analyze", ".", "--json", "--save-baseline"], root, { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    expect(existsSync(join(root, ".btar-score"))).toBe(false);
  });
  it("marks the JSON gate failed when tools are unavailable", () => {
    const result = run(["analyze", ".", "--json", "--fail-under", "0"], repository(), { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    expect(JSON.parse(String(result.stdout)).gateResult).toBe("failed");
  });
  it("rejects combining baseline replacement with regression checks", () => {
    const result = run(["analyze", ".", "--ratchet", "--save-baseline"], repository());
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("separately");
  });
  it("renders the Ink report and exits on tool failures", () => {
    const result = run(["analyze", "."], repository(), { ...process.env, PATH: "", CI: "true" });
    expect(result.status).toBe(1);
    expect(String(result.stdout)).toContain("btar · Python readiness");
    expect(String(result.stdout)).toContain("Summary");
  });
  it("rejects an older Hatch interpreter before measuring tools", () => {
    const root = repository();
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nprintf "3.13.0\\n"\nexit 1\n', { mode: 0o755 });
    const result = run(["analyze", ".", "--json"], root, { ...process.env, PATH: root });
    expect(result.status).toBe(1);
    expect(JSON.parse(String(result.stdout)).metrics.typeStrictness.python.error).toContain("Python 3.14+");
  });
  it("preserves brownfield metadata and refuses to replace a merge candidate", () => {
    const root = repository();
    const original = '[project]\nname = "existing"\n';
    writeFileSync(join(root, "pyproject.toml"), original);
    expect(run(["context", "generate", "python-toolchain", root], tmpdir()).status).toBe(0);
    expect(readFileSync(join(root, "pyproject.toml"), "utf8")).toBe(original);
    const candidate = readFileSync(join(root, "pyproject.btar.toml"), "utf8");
    expect(candidate).toContain('python = "3.14"');
    expect(run(["context", "generate", "python-toolchain", root], tmpdir()).status).toBe(1);
    expect(readFileSync(join(root, "pyproject.btar.toml"), "utf8")).toBe(candidate);
  });
  it("writes generated guidance in the requested repository", () => {
    const root = repository();
    expect(run(["context", "generate", "agents-md", root], tmpdir()).status).toBe(0);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("hatch run pyrefly check");
  });
  it("generates CircleCI for a separate repository and comparison branch", () => {
    const root = repository();
    expect(run(["init-ci", root, "--base-branch", "develop"], tmpdir()).status).toBe(0);
    const config = readFileSync(join(root, ".circleci/config.yml"), "utf8");
    expect(config).toContain("--compare-branch=origin/develop");
    expect(config).toContain("--fail-under=70");
    expect(run(["init-ci", root], tmpdir()).status).toBe(1);
    expect(readFileSync(join(root, ".circleci/config.yml"), "utf8")).toBe(config);
  });
  it("rejects a file used as a repository directory", () => {
    const root = repository();
    const result = run(["analyze", "example.py", "--json"], root);
    expect(result.status).toBe(1);
  });
});
