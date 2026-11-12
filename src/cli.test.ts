import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { generatePythonToolchainConfig } from "./core/context/python-toolchain.js";

const roots: string[] = [];
const cli = resolve("src/cli.ts");
const bun = Bun.which("bun")!;
function repository(python = true): string {
  const root = mkdtempSync(join(tmpdir(), "btar-cli-"));
  roots.push(root);
  if (python) writeFileSync(join(root, "example.py"), "answer: int = 42\n");
  return root;
}
function successfulHatch(root: string): void {
  writeFileSync(join(root, "hatch"), `#!${bun}
import {writeFileSync,appendFileSync} from 'node:fs';
const args=process.argv.slice(2);
appendFileSync('invocations.jsonl',JSON.stringify(args)+'\\n');
if(args[1]==='python') console.log('3.14.7');
else if(args[1]==='pyrefly') console.log(JSON.stringify({errors:[]}));
else if(args[1]==='ruff') console.log('[]');
else if(args[1]==='pytest') {
 const output=args.find(arg=>arg.startsWith('--cov-report=json:'));
 if(!output) process.exit(2);
 writeFileSync(output.slice('--cov-report=json:'.length),JSON.stringify({files:{"example.py":{executed_lines:[1]}},totals:{percent_covered:Number(process.env.BTAR_FAKE_COVERAGE??100)}}));
} else process.exit(2);
`, { mode: 0o755 });
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
  it("enforces the minimum Bun version at the CLI entry point", () => {
    const root = mkdtempSync(join(process.cwd(), ".btar-cli-test-"));
    roots.push(root);
    const bundled = join(root, "cli.js");
    for (const [version, expected] of [["1.4.3", 1], ["1.4.4", 0], ["1.5.0", 0], ["2.0.0", 0], ["1.4.4-canary.1", 1]] as const) {
      const build = spawnSync(bun, ["build", cli, "--target", "bun", "--packages", "external", "--define", `Bun.version=${JSON.stringify(version)}`, "--outfile", bundled], { encoding: "utf8" });
      expect(build.status, version).toBe(0);
      const result = spawnSync(bun, [bundled, "--help"], { encoding: "utf8" });
      expect(result.status, version).toBe(expected);
      expect(expected === 0 ? result.stdout : result.stderr).toContain(expected === 0 ? "Usage: btar" : "requires Bun 1.4.4");
    }
  });
  it("explains an empty project without suggesting Python tools", () => {
    const root = repository(false);
    const result = run(["analyze", ".", "--trust-project"], root);
    const output = String(result.stdout) + String(result.stderr);
    expect(result.status).toBe(1);
    expect(output).toContain("verification incomplete: no Python code detected");
    expect(output).not.toContain("Found:");
    expect(output).not.toContain("Metrics:");
    expect(output).not.toContain("Summary:");
    expect(output).not.toContain("pytest-cov");
    const json = run(["analyze", ".", "--trust-project", "--json"], root);
    expect(json.status).toBe(1);
    expect(JSON.parse(String(json.stdout)).recommendations).toEqual([]);
    expect(String(json.stderr)).toContain("no Python code detected");
  });
  it.each([[[]], [["--json"]]])("reports an invalid baseline alongside incomplete measurements %j", (format) => {
    const root = repository();
    writeFileSync(join(root, ".btar-score"), "{}");
    const result = run(["analyze", ".", "--trust-project", "--ratchet", ...format], root, { ...process.env, PATH: "" });
    const output = String(result.stdout) + String(result.stderr);
    expect(result.status).toBe(1);
    expect(output).toContain("verification incomplete");
    expect(output).toContain("baseline is incompatible or invalid");
  });
  it("reports unavailable Python measurements as failed JSON", () => {
    const result = run(["analyze", ".", "--trust-project", "--json"], repository(), { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    const report = JSON.parse(String(result.stdout));
    expect(report.languages).toEqual([expect.objectContaining({ language: "python" })]);
    expect(String(result.stdout)).not.toContain("Python readiness");
    expect(String(result.stderr)).toContain("incomplete");
  });
  it("does not satisfy a score gate without a Python project", () => {
    const result = run(["analyze", ".", "--trust-project", "--json", "--fail-under", "1"], repository(false));
    expect(result.status).toBe(1);
    const report = JSON.parse(String(result.stdout));
    expect(report).toMatchObject({ score: 0, gateResult: "failed", interpretation: "poor" });
    expect(report.metrics).toEqual({ typeStrictness: {}, lintErrors: {}, coverage: {} });
    expect(report.breakdown).toEqual({ typeStrictness: 0, lintErrors: 0, coverage: 0 });
    expect(report.recommendations).toBeInstanceOf(Array);
  });
  it("rejects malformed thresholds before running tools", () => {
    const result = run(["analyze", ".", "--trust-project", "--fail-under", "70garbage"], repository());
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("integer between 0 and 100");
  });
  it("does not save a baseline from failed measurements", () => {
    const root = repository();
    const result = run(["analyze", ".", "--trust-project", "--json", "--save-baseline"], root, { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    expect(existsSync(join(root, ".btar-score"))).toBe(false);
  });
  it("identifies Hatch when the fixer cannot find its executable", () => {
    const result = run(["fix", ".", "--trust-project"], repository(), { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    const output = String(result.stdout) + String(result.stderr);
    expect(output).toContain("Hatch");
    expect(output).toContain("Install Hatch");
    expect(output).not.toContain("ruff not found");
  });
  it("marks the JSON gate failed when tools are unavailable", () => {
    const result = run(["analyze", ".", "--trust-project", "--json", "--fail-under", "0"], repository(), { ...process.env, PATH: "" });
    expect(result.status).toBe(1);
    expect(JSON.parse(String(result.stdout)).gateResult).toBe("failed");
  });
  it("rejects combining baseline replacement with regression checks", () => {
    const result = run(["analyze", ".", "--trust-project", "--ratchet", "--save-baseline"], repository());
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
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nif [ "$2" = "python" ]; then printf "3.13.0\\n"; exit 0; fi\nprintf "measurement executed" > unexpected\nexit 2\n', { mode: 0o755 });
    const result = run(["analyze", ".", "--trust-project", "--json"], root, { ...process.env, PATH: root });
    expect(result.status).toBe(1);
    expect(JSON.parse(String(result.stdout)).metrics.typeStrictness.python.error).toContain("Python 3.14+");
    expect(existsSync(join(root, "unexpected"))).toBe(false);
  });
  it.each(["analyze", "fix"])("requires consent before %s can execute repository code", (command) => {
    const root = repository();
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nprintf executed > invoked\nexit 2\n', { mode: 0o755 });
    const result = run([command, "."], root, { ...process.env, PATH: root });
    expect(result.status).toBe(1);
    expect(existsSync(join(root, "invoked"))).toBe(false);
    expect(String(result.stdout) + String(result.stderr)).toContain("--trust-project");
  });
  it("keeps credential-like subprocess output out of reports and terminal errors", () => {
    const root = repository();
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nif [ "$2" = "python" ]; then printf "3.14.7\\n"; exit 0; fi\nprintf "%s" "$BTAR_TEST_SECRET" >&2\nexit 2\n', { mode: 0o755 });
    const env = { ...process.env, PATH: root, BTAR_TEST_SECRET: "credential-sentinel-do-not-report" };
    for (const args of [["analyze", ".", "--json"], ["analyze", "."], ["fix", "."]]) {
      const result = run([...args, "--trust-project"], root, env);
      expect(result.status).toBe(1);
      expect(String(result.stdout) + String(result.stderr)).not.toContain(env.BTAR_TEST_SECRET);
    }
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
  it("preserves standalone Hatch configuration and writes a merge candidate", () => {
    const root = repository();
    const original = '[envs.default]\nskip-install = true\ndependencies = []\n';
    writeFileSync(join(root, "hatch.toml"), original);
    const result = run(["context", "generate", "python-toolchain", root], tmpdir());
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "hatch.toml"), "utf8")).toBe(original);
    expect(existsSync(join(root, "pyproject.toml"))).toBe(false);
    expect(readFileSync(join(root, "pyproject.btar.toml"), "utf8")).toContain('[tool.hatch.envs.default]');
    expect(String(result.stdout)).toContain("hatch.toml");
    expect(run(["context", "generate", "python-toolchain", root], tmpdir()).status).toBe(1);
  });
  it("writes generated guidance in the requested repository", () => {
    const root = repository();
    expect(run(["context", "generate", "agents-md", root], tmpdir()).status).toBe(0);
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain("hatch run pyrefly check");
  });
  it("preserves instructions when Hatch configuration cannot be inspected", () => {
    const root = repository();
    const file = join(root, "AGENTS.md");
    const original = "# Maintainer instructions\nKeep this file.\n";
    writeFileSync(file, original);
    writeFileSync(join(root, "hatch.toml"), "[broken\n");
    const result = run(["context", "generate", "agents-md", root, "--update"], root);
    expect(result.status).toBe(1);
    expect(String(result.stderr)).toContain("hatch.toml");
    expect(readFileSync(file, "utf8")).toBe(original);
  });
  it("rejects instruction line breaks in a detected project path", () => {
    const root = repository(false);
    const project = join(root, "project\n## injected instructions");
    mkdirSync(project);
    writeFileSync(join(project, "example.py"), "answer = 42\n");
    const result = run(["context", "generate", "agents-md", root], root);
    expect(result.status).toBe(1);
    expect(existsSync(join(root, "AGENTS.md"))).toBe(false);
  });
  it("anchors map links and command directories to a custom output", () => {
    const root = repository();
    writeFileSync(join(root, "README.md"), "# Project\n");
    writeFileSync(join(root, "pyproject.toml"), '[project]\nname = "sample"\n');
    const output = join(root, "notes #1", "AGENTS.md");
    expect(run(["context", "generate", "agents-md", root, "--output", output], tmpdir()).status).toBe(0);
    const content = readFileSync(output, "utf8");
    expect(content).toContain("[README.md](../README.md)");
    expect(content).toContain("[pyproject.toml](../pyproject.toml)");
    expect(content).toContain("Repository root relative to this file: `..`");
  });
  it("updates only the managed context and validates historical reports", () => {
    const root = repository();
    const original = "# Existing\r\nKeep these bytes.\r\n";
    const destination = join(root, "AGENTS.md");
    writeFileSync(destination, original);
    writeFileSync(join(root, "pyproject.toml"), '[tool.hatch.envs.default.scripts]\ntest = "pytest"\nlint = "ruff check ."\n');
    writeFileSync(join(root, "hatch.toml"), '[envs.default.scripts]\ntest = "python -m pytest"\n');
    const args = ["context", "generate", "agents-md", root, "--update", "--build-command", "make build"];
    expect(run(args, root).status).toBe(0);
    const first = readFileSync(destination, "utf8");
    expect(first.startsWith(original)).toBe(true);
    expect(first).toContain("make build");
    expect(first).toContain("hatch run test");
    expect(first).toContain("lint: NOT_RECORDED");
    expect(first).toContain("Failure evidence: NOT_RECORDED");
    expect(run(args, root).status).toBe(0);
    expect(readFileSync(destination, "utf8")).toBe(first);
    const analysis = run(["analyze", ".", "--json"], root);
    const reportPath = join(root, "baseline.json");
    writeFileSync(reportPath, String(analysis.stdout));
    expect(run([...args, "--baseline-report", reportPath], root).status).toBe(0);
    const reported = readFileSync(destination, "utf8");
    expect(reported).toContain("type errors unavailable");
    const reportHash = createHash("sha256").update(readFileSync(reportPath)).digest("hex");
    expect(reported).toContain(`SHA256 \`${reportHash}\``);
    writeFileSync(reportPath, "{}");
    expect(run([...args, "--baseline-report", reportPath], root).status).toBe(1);
    expect(readFileSync(destination, "utf8")).toBe(reported);
    writeFileSync(destination, original + "<!-- BTAR:END -->\n");
    expect(run(args, root).status).toBe(1);
    expect(readFileSync(destination, "utf8")).toBe(original + "<!-- BTAR:END -->\n");
    expect(run([...args, "--force"], root).status).toBe(1);
  });
  it("preserves arbitrary bytes and rejects malformed markers", () => {
    const root = repository();
    const file = join(root, "AGENTS.md");
    const prefix = Buffer.from([0xff, 0x0a, ...Buffer.from("Inline <!-- BTAR:START --> documentation\r\n")]);
    const suffix = Buffer.from("\r\nUntouched suffix\r\n");
    const markers = Buffer.from("<!-- BTAR:START -->\r\nOld\r\n<!-- BTAR:END -->");
    writeFileSync(file, Buffer.concat([prefix, markers, suffix]));
    const args = ["context", "generate", "agents-md", root, "--update"];
    expect(run(args, root).status).toBe(0);
    const updated = readFileSync(file);
    expect(updated.toString("utf8")).toContain("## Repository map");
    expect(updated.toString("utf8")).not.toContain("Old");
    expect(updated.subarray(0, prefix.length)).toEqual(prefix);
    expect(updated.subarray(-suffix.length)).toEqual(suffix);
    expect(run(args, root).status).toBe(0);
    expect(readFileSync(file)).toEqual(updated);
    for (const malformed of ["<!-- BTAR:END -->\n<!-- BTAR:START -->\n", "<!-- BTAR:START -->\n<!-- BTAR:START -->\n<!-- BTAR:END -->\n"]) {
      writeFileSync(file, malformed);
      expect(run(args, root).status).toBe(1);
      expect(readFileSync(file, "utf8")).toBe(malformed);
    }
  });
  it("preserves documented block markers inside code fences", () => {
    const root = repository();
    const file = join(root, "AGENTS.md");
    const original = "# Maintainer guide\n\n```literal backticks```\n\n```md\n<!-- BTAR:START -->\nExample only.\n<!-- BTAR:END -->\n```\n";
    writeFileSync(file, original);
    const args = ["context", "generate", "agents-md", root, "--update"];
    expect(run(args, root).status).toBe(0);
    const updated = readFileSync(file, "utf8");
    expect(updated.startsWith(original)).toBe(true);
    expect(run(args, root).status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(updated);
    const unclosed = "# Maintainer guide\n\n```md\nExample only.\n";
    writeFileSync(file, unclosed);
    expect(run(args, root).status).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(unclosed);
  });
  it("preserves raw HTML marker examples when updating CR-only guidance", () => {
    const root = repository();
    const file = join(root, "AGENTS.md");
    const prefix = "<pre>\r<!-- BTAR:START -->\rExample instructions.\r<!-- BTAR:END -->\r</pre>\r\r";
    const suffix = "\rMaintainer suffix.\r";
    writeFileSync(file, `${prefix}<!-- BTAR:START -->\rOld\r<!-- BTAR:END -->${suffix}`);
    const args = ["context", "generate", "agents-md", root, "--update"];
    expect(run(args, root).status).toBe(0);
    const updated = readFileSync(file, "utf8");
    expect(updated.startsWith(prefix)).toBe(true);
    expect(updated.endsWith(suffix)).toBe(true);
    expect(updated).not.toContain("Old");
    expect(updated).toContain("## Repository map");
    expect(run(args, root).status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(updated);
  });
  it("reports recorded issues, scope, and score evidence", () => {
    const root = repository();
    const file = join(root, "AGENTS.md");
    const analysis = run(["analyze", ".", "--json"], root);
    const report = JSON.parse(String(analysis.stdout));
    report.metrics.typeStrictness.python = { metric: "type_strictness", tool: "pyrefly", value: 3, success: true };
    report.metrics.lintErrors.python = { metric: "lint_errors", tool: "ruff", value: 2, success: true };
    report.metrics.coverage.python = { metric: "test_coverage", tool: "pytest-cov", value: 75, success: true };
    const reportPath = join(root, "baseline.json");
    writeFileSync(reportPath, JSON.stringify(report));
    const score = { schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."], score: 50, timestamp: "2026-01-01T00:00:00.000Z", breakdown: { typeStrictness: 10, lintErrors: 10, coverage: 30 } };
    writeFileSync(join(root, ".btar-score"), JSON.stringify(score));
    const args = ["context", "generate", "agents-md", root, "--update", "--baseline-report", reportPath];
    expect(run(args, root).status).toBe(0);
    const content = readFileSync(file, "utf8");
    expect(content).toContain("type errors 3, lint errors 2, coverage 75%");
    expect(content).toContain("Recorded score: 50/100");
    report.languages[0].projectPath = "other";
    writeFileSync(reportPath, JSON.stringify(report));
    expect(run(args, root).status).toBe(1);
    expect(readFileSync(file, "utf8")).toBe(content);
    writeFileSync(join(root, ".btar-score"), "{}");
    expect(run(["context", "generate", "agents-md", root, "--update"], root).status).toBe(0);
    expect(readFileSync(file, "utf8")).toContain("INVALID or incompatible .btar-score");
  });
  it("explains consent for generated post-tool analysis", () => {
    const root = repository();
    const result = run(["context", "generate", "hooks", root], tmpdir());
    expect(result.status).toBe(0);
    expect(String(result.stdout)).toContain("Post-tool analysis requires consent");
    expect(String(result.stdout)).toContain("--trust-project");
    expect(String(result.stdout)).toContain("executing project code through Hatch");
    const settings = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    const command = settings.hooks.PostToolUse[0].hooks[0].command;
    expect(command).toContain("btar analyze");
    expect(command).not.toContain("--trust-project");

    const noPostRoot = repository();
    const noPost = run(["context", "generate", "hooks", noPostRoot, "--no-post"], tmpdir());
    expect(noPost.status).toBe(0);
    expect(String(noPost.stdout)).not.toContain("Post-tool analysis");
    const noPostSettings = JSON.parse(readFileSync(join(noPostRoot, ".claude", "settings.json"), "utf8"));
    expect(noPostSettings.hooks.PostToolUse).toBeUndefined();
  });
  it("generates CircleCI for a separate repository and comparison branch", () => {
    const root = repository();
    writeFileSync(join(root, "pyproject.toml"), generatePythonToolchainConfig());
    expect(run(["init-ci", root, "--base-branch", "develop"], tmpdir()).status).toBe(0);
    const config = readFileSync(join(root, ".circleci/config.yml"), "utf8");
    expect(config).toContain("--compare-branch=origin/develop");
    expect(config).toContain("--fail-under=70");
    expect(run(["init-ci", root], tmpdir()).status).toBe(1);
    expect(readFileSync(join(root, ".circleci/config.yml"), "utf8")).toBe(config);
  });
  it("distinguishes a failed score gate from unavailable measurements", () => {
    const root = repository();
    successfulHatch(root);
    const env = { ...process.env, PATH: root, BTAR_FAKE_COVERAGE: "50" };
    const result = run(["analyze", ".", "--trust-project", "--json", "--fail-under", "90"], root, env);
    expect(result.status).toBe(1);
    const report = JSON.parse(String(result.stdout));
    expect(report).toMatchObject({ score: 80, gateResult: "failed" });
    for (const measurements of Object.values(report.metrics)) {
      expect(Object.values(measurements as Record<string, {success:boolean}>).every(value => value.success)).toBe(true);
    }
    expect(run(["analyze", ".", "--trust-project", "--json", "--fail-under", "80"], root, env).status).toBe(0);
  });
  it("rejects legacy and changed-scope baselines until deliberately replaced", () => {
    const root = repository(false);
    mkdirSync(join(root, "packages", "first"), {recursive:true});
    writeFileSync(join(root, "packages", "first", "hatch.toml"), "[envs.default]\n");
    successfulHatch(root);
    const env = { ...process.env, PATH: root };
    writeFileSync(join(root, ".btar-score"), JSON.stringify({score:100,timestamp:new Date().toISOString(),breakdown:{typeStrictness:30,lintErrors:30,coverage:40}}));
    const legacy = run(["analyze", ".", "--trust-project", "--json", "--ratchet"], root, env);
    expect(legacy.status).toBe(1);
    expect(JSON.parse(String(legacy.stdout)).gateResult).toBe("failed");
    expect(String(legacy.stderr)).toContain("--save-baseline");
    expect(run(["analyze", ".", "--trust-project", "--json", "--save-baseline"], root, env).status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, ".btar-score"), "utf8"))).toMatchObject({schemaVersion:1,projectPaths:["packages/first"]});
    expect(run(["analyze", ".", "--trust-project", "--json", "--ratchet"], root, env).status).toBe(0);
    mkdirSync(join(root, "packages", "other"), {recursive:true});
    writeFileSync(join(root, "packages", "other", "hatch.toml"), "[envs.default]\n");
    const changed = run(["analyze", ".", "--trust-project", "--json", "--ratchet"], root, env);
    expect(changed.status).toBe(1);
    expect(JSON.parse(String(changed.stdout)).gateResult).toBe("failed");
  });
  it("rejects a file used as a repository directory", () => {
    const root = repository();
    const result = run(["analyze", "example.py", "--json"], root);
    expect(result.status).toBe(1);
  });
});
