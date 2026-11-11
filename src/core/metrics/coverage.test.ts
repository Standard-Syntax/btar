import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { measureCoverage, COVERAGE_TOOLS, parsePytestCoverageJson } from "./coverage.js";

let root: string;
let oldPath: string | undefined;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "btar-invocation-"));
  oldPath = process.env.PATH;
  process.env.PATH = root;
  process.env.BTAR_RECORD = join(root, "record");
  writeFileSync(join(root, "hatch"), "#!/bin/sh\nprintf '%s\\n' \"$PWD\" \"$@\" > \"$BTAR_RECORD\"\nif [ \"$BTAR_OUTPUT\" = hang ]; then exec /bin/sleep 10; fi\nfor arg in \"$@\"; do\n  case \"$arg\" in --cov-report=json:*) printf '%s' \"$BTAR_OUTPUT\" > \"${arg#--cov-report=json:}\";; esac\ndone\nexit \"$BTAR_STATUS\"\n", { mode: 0o755 });
});
afterEach(() => {
  if (oldPath === undefined) delete process.env.PATH; else process.env.PATH = oldPath;
  delete process.env.BTAR_RECORD; delete process.env.BTAR_OUTPUT; delete process.env.BTAR_STATUS;
  rmSync(root, { recursive: true, force: true });
});

describe.skipIf(process.platform === "win32")("measureCoverage invocation", () => {
  it("executes Hatch in the target directory and consumes its output", async () => {
    process.env.BTAR_OUTPUT = "{\"files\":{\"sample.py\":{}},\"totals\":{\"percent_covered\":87.5}}";
    process.env.BTAR_STATUS = "0";
    const result = await measureCoverage("python", root);
    expect(result.success).toBe(true);
    expect(result.value).toBe(87.5);
    const lines = readFileSync(join(root, "record"), "utf8").trim().split("\n");
    expect(lines[0]).toBe(root);
    expect(lines.slice(1, 4)).toEqual(["run", "pytest", "--cov"]);
    expect(lines[4]).toMatch(/^--cov-report=json:.*coverage\.json$/);
    expect(lines[5]).toBe("-q");
  });
  it("reports a subprocess timeout", async () => {
    const original = globalThis.setTimeout;
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: (...args: unknown[]) => void, delay?: number, ...args: unknown[]) => original(callback, delay === 120000 ? 150 : delay, ...args)) as typeof setTimeout);
    try {
      process.env.BTAR_OUTPUT = "hang"; process.env.BTAR_STATUS = "0";
      const result = await measureCoverage("python", root);
      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).toContain("timed out");
    } finally { spy.mockRestore(); }
  });
  it("reports subprocess failure", async () => {
    process.env.BTAR_OUTPUT = "failure"; process.env.BTAR_STATUS = "2";
    expect((await measureCoverage("python", root)).success).toBe(false);
  });
  it("rejects malformed output", async () => {
    process.env.BTAR_OUTPUT = "not json"; process.env.BTAR_STATUS = "0";
    expect((await measureCoverage("python", root)).success).toBe(false);
  });
});

describe("pytest-cov metrics", () => {
  it("uses pytest-cov through Hatch", () => expect(COVERAGE_TOOLS.python.command).toEqual(["hatch", "run", "pytest", "--cov", "--cov-report=json:coverage.json", "-q"]));
  it("reads the reported percentage", () => expect(parsePytestCoverageJson('{"files":{"sample.py":{"executed_lines":[1],"summary":{"covered_lines":1,"num_statements":1,"percent_covered":87.5},"missing_lines":[],"excluded_lines":[]}},"totals":{"percent_covered":87.5}}', "", 0)).toBe(87.5));
  it("rejects reports without a nonempty files object", () => {
    for (const files of [undefined, {}, [], null, "invalid", { "sample.py": null }, { "sample.py": [] }, { "": {} }]) {
      expect(parsePytestCoverageJson(JSON.stringify({ files, totals: { percent_covered: 100 } }), "", 0)).toBe(-1);
    }
  });
  it("rejects missing or unsuccessful evidence", () => {
    expect(parsePytestCoverageJson("{}", "", 0)).toBe(-1);
    expect(parsePytestCoverageJson('{"totals":{"percent_covered":80}}', "", 1)).toBe(-1);
  });
});
