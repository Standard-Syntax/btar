import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { detectBuildSystem, detectLanguages } from "./detector.js";
import type { BTARConfig } from "./types.js";

const config: BTARConfig = { thresholds: { type_strictness: 0, lint_errors: 0, test_coverage: 70, ci_time: 600, flaky_rate: 1 }, exclude: [], languages: [] };
const directories: string[] = [];
function directory(): string { const value = mkdtempSync(join(tmpdir(), "btar-python-")); directories.push(value); return value; }
afterEach(() => { for (const value of directories.splice(0)) rmSync(value, { recursive: true, force: true }); });

describe("Python detection", () => {
  it("finds a Hatch project", async () => {
    const root = directory();
    writeFileSync(join(root, "pyproject.toml"), "[tool.hatch.envs.default]\n");
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", confidence: "high", markers: ["pyproject.toml"], buildSystem: "hatch" }]);
  });

  it("recognizes standalone Hatch configuration", async () => {
    const root = directory();
    writeFileSync(join(root, "hatch.toml"), '[envs.default]\npython = "3.14"\n');
    expect((await detectLanguages(root, config))[0].buildSystem).toBe("hatch");
  });

  it("finds a brownfield Python script without project metadata", async () => {
    const root = directory();
    writeFileSync(join(root, "example.py"), "print('hello')\n");
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", confidence: "medium", markers: ["."], buildSystem: "legacy-python" }]);
  });

  it("does not call every pyproject a Hatch project", () => {
    const root = directory();
    writeFileSync(join(root, "pyproject.toml"), "[project]\nname = 'legacy'\n");
    expect(detectBuildSystem(root)).toBe("legacy-python");
  });

  it("honors an excluded source glob", async () => {
    const root = directory();
    writeFileSync(join(root, "generated.py"), "print('generated')\n");
    await expect(detectLanguages(root, { ...config, exclude: ["*.py"] })).resolves.toEqual([]);
  });

  it("does not claim that a nested Hatch project runs from an unconfigured root", async () => {
    const root = directory();
    const packageDirectory = join(root, "package");
    mkdirSync(packageDirectory);
    writeFileSync(join(packageDirectory, "pyproject.toml"), "[tool.hatch.envs.default]\n");
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", confidence: "high", markers: ["package/pyproject.toml"], buildSystem: "legacy-python" }]);
  });
});
