import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const cli = resolve("src/cli.ts");

describe("python toolchain generation", () => {
  it.each(["setup.py", "setup.cfg"])("preserves legacy packaging in %s", (packaging) => {
    const root = mkdtempSync(join(tmpdir(), "btar-legacy-"));
    try {
      writeFileSync(join(root, packaging), "original content");
      const result = spawnSync(Bun.which("bun")!, [cli, "context", "generate", "python-toolchain", root], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(existsSync(join(root, "pyproject.toml"))).toBe(false);
      expect(existsSync(join(root, "pyproject.btar.toml"))).toBe(true);
      expect(readFileSync(join(root, packaging), "utf8")).toBe("original content");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("creates parent directories for a custom output", () => {
    const root = mkdtempSync(join(tmpdir(), "btar-output-"));
    try {
      const output = join(root, "nested", "output.toml");
      const result = spawnSync(Bun.which("bun")!, [cli, "context", "generate", "python-toolchain", root, "--output", output], { encoding: "utf8" });
      expect(result.status).toBe(0);
      expect(existsSync(output)).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
