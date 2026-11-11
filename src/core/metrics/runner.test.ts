import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runTool } from "./runner.js";

describe("runTool", () => {
  it("captures output and exit status", async () => {
    expect(await runTool({ command: [process.execPath, "-e", "console.log('hello'); console.error('oops'); process.exit(2)"], cwd: process.cwd() })).toMatchObject({ stdout: "hello\n", stderr: "oops\n", exitCode: 2, timedOut: false });
  });

  it.skipIf(process.platform === "win32")("times out a child and its pipe-holding descendant", async () => {
    const root = mkdtempSync(join(tmpdir(), "btar-tree-"));
    const marker = join(root, "descendant-survived");
    const descendant = `setTimeout(() => require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'alive'), 500)`;
    const script = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], {stdio: 'inherit'}); setTimeout(() => {}, 3000)`;
    try {
      const result = await runTool({ command: [process.execPath, "-e", script], cwd: root, timeout: 150 });
      expect(result).toMatchObject({ exitCode: -1, timedOut: true });
      await new Promise((resolve) => setTimeout(resolve, 700));
      expect(existsSync(marker)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 5000);

  it.skipIf(process.platform === "win32")("settles even when a descendant escapes the process group", async () => {
    const script = "require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => {}, 2000)'], {stdio: 'inherit', detached: true}).unref(); setTimeout(() => {}, 3000)";
    const start = Date.now();
    const result = await runTool({ command: [process.execPath, "-e", script], cwd: process.cwd(), timeout: 150 });
    expect(result).toMatchObject({ exitCode: -1, timedOut: true });
    expect(Date.now() - start).toBeLessThan(1500);
  }, 5000);
});
