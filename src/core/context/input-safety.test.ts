import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateAgentsMd } from "./agents-md.js";
import { inspectRepository } from "./repository-context.js";
import type { DetectedLanguage } from "../types.js";

const python = (projectPath = "."): DetectedLanguage => ({ language: "python", projectPath, confidence: "high", markers: [], buildSystem: "hatch" });

describe("repository input safety", () => {
  it("keeps repository strings from creating Markdown instructions", () => {
    expect(() => generateAgentsMd({ projectName: "ok\n## injected", languages: [] })).toThrow();
    expect(() => generateAgentsMd({ projectName: "ok", languages: [python("x\n## injected")] })).toThrow();
    expect(() => generateAgentsMd({ projectName: "ok", languages: [], repositoryRoot: "x\n## injected" })).toThrow();
    const content = generateAgentsMd({ projectName: "[name](https://example.com)", languages: [python("a`b")] });
    const html = Bun.markdown.html(content);
    expect(html).not.toContain('<a href="https://example.com">');
    expect(html).toContain("a`b");
    expect(() => generateAgentsMd({ projectName: "ok", languages: [], context: { projects: [], paths: [], score: { kind: "recorded", score: 1, timestamp: "today\n## injected" }, report: undefined } })).toThrow();
    expect(() => generateAgentsMd({ projectName: "ok", languages: [], context: { projects: [], paths: [], score: { kind: "missing" }, report: { source: "report\n## injected", hash: "hash", projects: [] } } })).toThrow();
    expect(Bun.markdown.html(generateAgentsMd({ projectName: "ok", languages: [python()], testCommand: "echo `x`" }))).toContain("echo `x`");
  });
  it("reports malformed Hatch configuration and allows absent configuration", async () => {
    const root = mkdtempSync(join(tmpdir(), "btar-hatch-"));
    try {
      await expect(inspectRepository(root, [python()])).resolves.toBeDefined();
      writeFileSync(join(root, "pyproject.toml"), "[broken\n");
      await expect(inspectRepository(root, [python()])).rejects.toThrow(/pyproject\.toml/);
      rmSync(join(root, "pyproject.toml"));
      symlinkSync("missing.toml", join(root, "hatch.toml"));
      await expect(inspectRepository(root, [python()])).rejects.toThrow(/hatch\.toml/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects duplicate detected and report roots", async () => {
    const root = mkdtempSync(join(tmpdir(), "btar-duplicates-"));
    try {
      await expect(inspectRepository(root, [python(), python()])).rejects.toThrow(/duplicate/i);
      const report = join(root, "report.json");
      writeFileSync(report, JSON.stringify({ languages: [{ language: "python", projectPath: "." }, { language: "python", projectPath: "." }], metrics: {} }));
      await expect(inspectRepository(root, [python()], report)).rejects.toThrow(/duplicate/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("rejects oversized and non-regular reports before parsing", async () => {
    const root = mkdtempSync(join(tmpdir(), "btar-report-"));
    try {
      const report = join(root, "report.json");
      writeFileSync(report, Buffer.alloc(20 * 1024 * 1024));
      await expect(inspectRepository(root, [python()], report)).rejects.toThrow(/size|large/i);
      const dir = join(root, "dir"); mkdirSync(dir);
      await expect(inspectRepository(root, [python()], dir)).rejects.toThrow(/regular file/i);
      const device = join(root, "device"); symlinkSync("/dev/zero", device);
      await expect(inspectRepository(root, [python()], device)).rejects.toThrow(/regular file/i);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
