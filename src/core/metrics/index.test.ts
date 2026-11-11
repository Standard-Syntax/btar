import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DetectedLanguage } from "../types.js";
import { runAllMetrics } from "./index.js";

const directories: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "btar-project-metrics-"));
  directories.push(root);
  const bin = join(root, "bin");
  const calls = join(root, "calls.jsonl");
  mkdirSync(bin);
  const executable = join(bin, "hatch");
  writeFileSync(executable, `#!${process.execPath}\n
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(calls)}, JSON.stringify({ cwd: process.cwd(), tool: args[1] }) + "\\n");
const settings = JSON.parse(readFileSync(join(process.cwd(), "fixture.json"), "utf8"));
if (args[1] === "python") {
  process.stdout.write(settings.version + "\\n");
  process.stderr.write(settings.stderr ?? "");
  process.exit(settings.exitCode ?? 0);
}
if (args[1] === "pyrefly") {
  console.log(JSON.stringify({ errors: Array.from({ length: settings.types }, () => ({ severity: "error" })) }));
} else if (args[1] === "ruff") {
  console.log(JSON.stringify(Array.from({ length: settings.lint }, () => ({ code: "E501" }))));
} else if (args[1] === "pytest") {
  const output = args.find((arg) => arg.startsWith("--cov-report=json:")).slice("--cov-report=json:".length);
  writeFileSync(output, JSON.stringify({ files: { "sample.py": {} }, totals: { percent_covered: settings.coverage } }));
}
`);
  chmodSync(executable, 0o755);
  vi.stubEnv("PATH", `${bin}:${process.env.PATH}`);
  return {
    root,
    calls,
    project(projectPath: string, settings: { version?: string; exitCode?: number; stderr?: string; types?: number; lint?: number; coverage?: number } = {}): DetectedLanguage {
      const directory = join(root, projectPath);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "fixture.json"), JSON.stringify({ version: "3.14.0", types: 0, lint: 0, coverage: 100, ...settings }));
      return { language: "python", projectPath, confidence: "high", markers: [], buildSystem: "hatch" };
    },
  };
}

describe("project metric orchestration", () => {
  it("does not execute Hatch or any metric without explicit consent", async () => {
    const environment = fixture();
    const report = await runAllMetrics({ directory: environment.root, languages: [environment.project(".")] });
    expect(existsSync(environment.calls)).toBe(false);
    for (const results of Object.values(report.metrics)) {
      expect(results.get("python")).toMatchObject({ success: false, value: -1, diagnostic: "consent-required" });
    }
  });

  it("does not execute anything when no projects were detected", async () => {
    const environment = fixture();
    const report = await runAllMetrics({ directory: environment.root, languages: [], trustedProject: true });
    expect(existsSync(environment.calls)).toBe(false);
    expect(report.metrics.typeStrictness.size).toBe(0);
  });

  it("runs each project in its own directory and retains all results", async () => {
    const environment = fixture();
    const languages = [
      environment.project(".", { types: 1, lint: 2, coverage: 60 }),
      environment.project("packages/one", { types: 3, lint: 4, coverage: 90 }),
      environment.project("packages/two", { types: 5, lint: 6, coverage: 30 }),
    ];
    const report = await runAllMetrics({ directory: environment.root, languages, trustedProject: true });
    expect([...report.metrics.typeStrictness.keys()]).toEqual(["python", "python:packages/one", "python:packages/two"]);
    expect([...report.metrics.typeStrictness.values()].map((result) => result.value)).toEqual([1, 3, 5]);
    expect(report.summary).toEqual({ totalTypeErrors: 9, totalLintErrors: 12, averageCoverage: 60 });
    const calls: unknown[] = readFileSync(environment.calls, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(calls).toEqual(languages.flatMap((project) => ["python", "pyrefly", "ruff", "pytest"].map((tool) => ({ cwd: join(environment.root, project.projectPath), tool }))));
  });

  it.each([0, 1])("rejects Python 3.13 even when the runtime exits with %s", async (exitCode) => {
    const environment = fixture();
    const languages = [environment.project(".", { version: "3.13.9", exitCode })];
    const report = await runAllMetrics({ directory: environment.root, languages, trustedProject: true });
    expect(report.metrics.typeStrictness.get("python")).toMatchObject({ success: false, diagnostic: "unsupported-python" });
    expect(readFileSync(environment.calls, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("keeps unavailable runtime diagnostics distinct and does not expose subprocess text", async () => {
    const environment = fixture();
    const languages = [environment.project(".", { version: "secret stdout", stderr: "secret stderr", exitCode: 127 })];
    const report = await runAllMetrics({ directory: environment.root, languages, trustedProject: true });
    expect(report.metrics.typeStrictness.get("python")).toMatchObject({ success: false, diagnostic: "runtime-unavailable" });
    expect(JSON.stringify([...report.metrics.typeStrictness.values()])).not.toContain("secret");
  });

  it("rejects invalid version output after a successful exit", async () => {
    const environment = fixture();
    const languages = [environment.project(".", { version: "3.14.0\nsecret extra output" })];
    const report = await runAllMetrics({ directory: environment.root, languages, trustedProject: true });
    expect(report.metrics.typeStrictness.get("python")).toMatchObject({ success: false, diagnostic: "invalid-report" });
    expect(readFileSync(environment.calls, "utf8").trim().split("\n")).toHaveLength(1);
  });

  it("continues supported projects after another project's runtime fails", async () => {
    const environment = fixture();
    const languages = [environment.project("old", { version: "3.13.8" }), environment.project("supported", { types: 2 })];
    const report = await runAllMetrics({ directory: environment.root, languages, trustedProject: true });
    expect(report.metrics.typeStrictness.get("python:old")).toMatchObject({ success: false, diagnostic: "unsupported-python" });
    expect(report.metrics.typeStrictness.get("python:supported")).toMatchObject({ success: true, value: 2 });
    expect(report.summary.totalTypeErrors).toBe(2);
  });
});
