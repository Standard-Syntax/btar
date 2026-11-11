import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureTypeStrictness, parsePyreflyErrors, TYPE_CHECKER_TOOLS } from "./type-checker.js";

let root: string;
let oldPath: string | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "btar-invocation-"));
  oldPath = process.env.PATH;
  process.env.PATH = root;
  process.env.BTAR_RECORD = join(root, "record");
  writeFileSync(join(root, "hatch"), "#!/bin/sh\nprintf '%s\\n' \"$PWD\" \"$@\" > \"$BTAR_RECORD\"\nif [ \"$BTAR_OUTPUT\" = hang ]; then exec /bin/sleep 10; fi\nprintf \"%s\" \"$BTAR_OUTPUT\"\nexit \"$BTAR_STATUS\"\n", { mode: 0o755 });
});
afterEach(() => {
  if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
  delete process.env.BTAR_RECORD; delete process.env.BTAR_OUTPUT; delete process.env.BTAR_STATUS;
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("measureTypeStrictness invocation", () => {
  it("executes Hatch in the target directory and consumes its output", async () => {
    process.env.BTAR_OUTPUT = "{\"errors\":[{\"severity\":\"error\"},{\"severity\":\"warning\"}]}";
    process.env.BTAR_STATUS = "0";
    const result = await measureTypeStrictness("python", root);
    expect(result.success).toBe(true);
    expect(result.value).toBe(1);
    const lines = readFileSync(join(root, "record"), "utf8").trim().split("\n");
    expect(lines[0]).toBe(root);
    expect(lines.slice(1)).toEqual(["run", "pyrefly", "check", "--output-format=json"]);
  });
  it("reports a subprocess timeout", async () => {
    const original = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => original(callback, delay === 120000 ? 150 : delay, ...args)) as typeof setTimeout);
    try {
      process.env.BTAR_OUTPUT = "hang"; process.env.BTAR_STATUS = "0";
      const result = await measureTypeStrictness("python", root);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).toContain("timed out");
    } finally { spy.mockRestore(); }
  });
  it("reports subprocess failure", async () => {
    process.env.BTAR_OUTPUT = "failure"; process.env.BTAR_STATUS = "2";
    expect((await measureTypeStrictness("python", root)).success).toBe(false);
  });
  it("rejects malformed output", async () => {
    process.env.BTAR_OUTPUT = "not json"; process.env.BTAR_STATUS = "0";
    expect((await measureTypeStrictness("python", root)).success).toBe(false);
  });
});

describe("Pyrefly metrics", () => {
  it("uses Hatch and counts only error diagnostics", () => {
    expect(TYPE_CHECKER_TOOLS.python.command).toEqual(["hatch", "run", "pyrefly", "check", "--output-format=json"]);
    expect(parsePyreflyErrors('{"errors":[{"severity":"error"},{"severity":"warning"}]}', "", 1)).toBe(1);
  });
  it("rejects an unsuccessful check without diagnostic evidence", () => {
    expect(parsePyreflyErrors('{"errors":[]}', "", 1)).toBe(-1);
  });
});
