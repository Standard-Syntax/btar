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
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", projectPath: ".", confidence: "high", markers: ["pyproject.toml"], buildSystem: "hatch" }]);
  });

  it("recognizes standalone Hatch configuration", async () => {
    const root = directory();
    writeFileSync(join(root, "hatch.toml"), '[envs.default]\npython = "3.14"\n');
    expect((await detectLanguages(root, config))[0].buildSystem).toBe("hatch");
  });

  it("finds a brownfield Python script without project metadata", async () => {
    const root = directory();
    writeFileSync(join(root, "example.py"), "print('hello')\n");
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", projectPath: ".", confidence: "medium", markers: ["."], buildSystem: "legacy-python" }]);
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

  it("preserves the directory and build system of a nested Hatch project", async () => {
    const root = directory();
    const packageDirectory = join(root, "package");
    mkdirSync(packageDirectory);
    writeFileSync(join(packageDirectory, "pyproject.toml"), "[tool.hatch.envs.default]\n");
    await expect(detectLanguages(root, config)).resolves.toEqual([{ language: "python", projectPath: "package", confidence: "high", markers: ["package/pyproject.toml"], buildSystem: "hatch" }]);
  });
  it("discovers every deeply nested project despite a root Python script", async () => {
    const root = directory();
    writeFileSync(join(root, "script.py"), "pass\n");
    for (const name of ["packages/first", "packages/second"]) {
      mkdirSync(join(root, name, "src"), { recursive: true });
      writeFileSync(join(root, name, "pyproject.toml"), "[tool.hatch.envs.default]\n");
      writeFileSync(join(root, name, "src", "example.py"), "pass\n");
    }
    const projects = await detectLanguages(root, config);
    expect(projects.map(({ projectPath, buildSystem }) => ({ projectPath, buildSystem }))).toEqual([
      { projectPath: ".", buildSystem: "legacy-python" },
      { projectPath: "packages/first", buildSystem: "hatch" },
      { projectPath: "packages/second", buildSystem: "hatch" },
    ]);
  });

  it("finds nested metadata inside a root project without treating source folders as projects", async () => {
    const root = directory();
    writeFileSync(join(root, "pyproject.toml"), "[tool.hatch.envs.default]\n");
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src", "example.py"), "pass\n");
    mkdirSync(join(root, "packages", "nested"), { recursive: true });
    writeFileSync(join(root, "packages", "nested", "pyproject.toml"), "[project]\nname = 'nested'\n");
    expect((await detectLanguages(root, config)).map((project) => project.projectPath)).toEqual([".", "packages/nested"]);
  });

  it("excludes hidden and visible nested projects with a universal glob", async () => {
    const root = directory();
    for (const name of [".hidden/project", "visible/project"]) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, "pyproject.toml"), "[project]\n");
    }
    expect((await detectLanguages(root, config)).map((project) => project.projectPath)).toContain(".hidden/project");
    expect(await detectLanguages(root, { ...config, exclude: ["**/*"] })).toEqual([]);
  });

  it("prunes excluded nested projects", async () => {
    const root = directory();
    for (const name of ["packages/keep", "packages/skip", ".venv/package"]) {
      mkdirSync(join(root, name), { recursive: true });
      writeFileSync(join(root, name, "pyproject.toml"), "[tool.hatch.envs.default]\n");
    }
    expect((await detectLanguages(root, { ...config, exclude: ["packages/skip/**"] })).map((project) => project.projectPath)).toEqual(["packages/keep"]);
  });

});
