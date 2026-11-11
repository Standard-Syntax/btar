/**
 * Coverage Measurement Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { COVERAGE_TOOLS, measureCoverage, parseJacocoCoverage } from "./coverage.js";
import * as runner from "./runner.js";
import * as fs from "node:fs/promises";

// Mock the runner module
vi.mock("./runner.js", () => ({
  runTool: vi.fn(),
}));

describe("COVERAGE_TOOLS", () => {
  describe("tool mappings", () => {
    it("maps typescript to c8", () => {
      expect(COVERAGE_TOOLS.typescript.tool).toBe("c8");
      expect(COVERAGE_TOOLS.typescript.command).toContain("c8");
    });

    it("maps javascript to c8", () => {
      expect(COVERAGE_TOOLS.javascript.tool).toBe("c8");
      expect(COVERAGE_TOOLS.javascript.command).toContain("c8");
    });

    it("maps python to SlipCover + pytest", () => {
      expect(COVERAGE_TOOLS.python.tool).toBe("slipcover");
      expect(COVERAGE_TOOLS.python.command).toEqual([
        "uv", "run", "--python", "3.14", "python", "-m", "slipcover", "--json", "-m", "pytest", "-q",
      ]);
    });

    it("maps go to go test", () => {
      expect(COVERAGE_TOOLS.go.tool).toBe("go test");
      expect(COVERAGE_TOOLS.go.command).toContain("go");
      expect(COVERAGE_TOOLS.go.command).toContain("-cover");
    });

    it("maps all supported languages", () => {
      const languages = [
        "typescript",
        "javascript",
        "python",
        "go",
        "java",
        "kotlin",
        "swift",
        "ruby",
        "php",
      ] as const;

      for (const lang of languages) {
        expect(COVERAGE_TOOLS[lang]).toBeDefined();
        expect(COVERAGE_TOOLS[lang].tool).toBeTruthy();
        expect(COVERAGE_TOOLS[lang].command.length).toBeGreaterThan(0);
        expect(typeof COVERAGE_TOOLS[lang].parseCoverage).toBe("function");
      }
    });
  });
});

describe("coverage parsing", () => {
  describe("c8/nyc parser", () => {
    const parser = COVERAGE_TOOLS.typescript.parseCoverage;

    it("parses All files percentage", () => {
      const stdout = `
----------|---------|----------|---------|---------|-------------------
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   85.5  |    90.2  |   78.3  |   85.5  |
 src/     |   85.5  |    90.2  |   78.3  |   85.5  |
----------|---------|----------|---------|---------|-------------------
`;
      expect(parser(stdout, "", 0)).toBe(85.5);
    });

    it("parses integer percentage", () => {
      const stdout = `
All files |   100   |   100    |   100   |   100   |
`;
      expect(parser(stdout, "", 0)).toBe(100);
    });

    it("returns -1 for tool not found (exit 127)", () => {
      expect(parser("", "command not found", 127)).toBe(-1);
    });

    it("returns 0 for no coverage data", () => {
      const stdout = "No tests found";
      expect(parser(stdout, "", 1)).toBe(0);
    });

    it("clamps values to 0-100 range", () => {
      // Edge case: percentage > 100 (shouldn't happen but handle it)
      const stdout = `All files | 150.5 |`;
      expect(parser(stdout, "", 0)).toBe(100);
    });
  });

  describe("SlipCover JSON parser", () => {
    const parser = COVERAGE_TOOLS.python.parseCoverage;
    const report = (value: number) => JSON.stringify({
      files: { "app.py": { executed_lines: [1], missing_lines: [2] } },
      summary: { percent_covered: value },
    });
    it("reads global percentage", () => {
      expect(parser(report(82.5), "", 0)).toBe(82.5);
    });
    it("rejects missing reports, out-of-range data, and failures", () => {
      expect(parser('{"files":{},"summary":{"percent_covered":100}}', "", 0)).toBe(-1);
      expect(parser("not-json", "", 0)).toBe(-1);
      expect(parser(report(102), "", 0)).toBe(-1);
      expect(parser(report(80), "", 1)).toBe(-1);
    });
  });

  describe("go test parser", () => {
    const parser = COVERAGE_TOOLS.go.parseCoverage;

    it("parses coverage percentage from single package", () => {
      const stdout = `
ok  	example.com/pkg	0.015s	coverage: 72.5% of statements
`;
      expect(parser(stdout, "", 0)).toBe(72.5);
    });

    it("parses coverage from multiple packages (averages)", () => {
      const stdout = `
ok  	example.com/pkg1	0.010s	coverage: 80.0% of statements
ok  	example.com/pkg2	0.012s	coverage: 60.0% of statements
`;
      expect(parser(stdout, "", 0)).toBe(70); // Average of 80 and 60
    });

    it("returns 0 for no test files", () => {
      const stdout = `
?   	example.com/pkg	[no test files]
`;
      expect(parser(stdout, "", 0)).toBe(0);
    });

    it("returns -1 for tool not found", () => {
      expect(parser("", "go: command not found", 127)).toBe(-1);
    });

    it("parses integer percentage", () => {
      const stdout = `
ok  	example.com/pkg	0.015s	coverage: 100% of statements
`;
      expect(parser(stdout, "", 0)).toBe(100);
    });
  });

  describe("JaCoCo XML parser", () => {
    it("parses LINE counter from JaCoCo XML", () => {
      const xml = `<?xml version="1.0"?>
<report name="test">
  <counter type="INSTRUCTION" missed="100" covered="200"/>
  <counter type="BRANCH" missed="10" covered="30"/>
  <counter type="LINE" missed="50" covered="150"/>
  <counter type="METHOD" missed="5" covered="20"/>
</report>`;
      // 150 / (50 + 150) = 0.75 = 75%
      expect(parseJacocoCoverage(xml)).toBe(75);
    });

    it("returns 0 when no LINE counter found", () => {
      const xml = `<?xml version="1.0"?><report name="test"></report>`;
      expect(parseJacocoCoverage(xml)).toBe(0);
    });

    it("returns 0 when total is 0", () => {
      const xml = `<counter type="LINE" missed="0" covered="0"/>`;
      expect(parseJacocoCoverage(xml)).toBe(0);
    });

    it("handles 100% coverage", () => {
      const xml = `<counter type="LINE" missed="0" covered="200"/>`;
      expect(parseJacocoCoverage(xml)).toBe(100);
    });

    it("rounds to one decimal place", () => {
      const xml = `<counter type="LINE" missed="1" covered="2"/>`;
      // 2/3 = 66.666... → 66.7
      expect(parseJacocoCoverage(xml)).toBe(66.7);
    });

    it("uses last LINE counter (report-level aggregate) not first (method-level)", () => {
      const xml = `<?xml version="1.0"?>
<report name="test">
  <package name="com/example">
    <class name="com/example/Foo">
      <method name="bar" desc="()V" line="5">
        <counter type="LINE" missed="3" covered="0"/>
      </method>
      <counter type="LINE" missed="3" covered="0"/>
    </class>
    <counter type="LINE" missed="3" covered="0"/>
  </package>
  <counter type="LINE" missed="50" covered="150"/>
</report>`;
      // Should use last match (report-level): 150/(50+150) = 75%
      // NOT first match (method-level): 0/(3+0) = 0%
      expect(parseJacocoCoverage(xml)).toBe(75);
    });
  });
});

describe("measureCoverage", () => {
  const mockRunTool = vi.mocked(runner.runTool);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns coverage percentage for typescript", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "All files | 85.5 | 90 | 80 | 85.5 |",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureCoverage("typescript", "/test/project");

    expect(result.metric).toBe("test_coverage");
    expect(result.tool).toBe("c8");
    expect(result.value).toBe(85.5);
    expect(result.success).toBe(true);
  });

  it("measures Python only from a fresh JSON artifact", async () => {
    mockRunTool.mockImplementationOnce(async ({ command }) => {
      const out = command[command.indexOf("--out") + 1];
      await fs.writeFile(out, JSON.stringify({
        files: { "app.py": { executed_lines: [1], missing_lines: [2] } },
        summary: { percent_covered: 80 },
      }));
      return { stdout: "2 passed", stderr: "", exitCode: 0, timedOut: false };
    });
    const result = await measureCoverage("python", "/test/project");
    expect(result.metric).toBe("test_coverage");
    expect(result.tool).toBe("slipcover");
    expect(result.value).toBe(80);
    expect(result.success).toBe(true);
  });

  it("rejects Python test failures", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "1 failed", stderr: "", exitCode: 1, timedOut: false,
    });
    const result = await measureCoverage("python", "/test/project");
    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
  });

  it("rejects a missing SlipCover report", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "1 passed", stderr: "", exitCode: 0, timedOut: false,
    });
    const result = await measureCoverage("python", "/test/project");
    expect(result.success).toBe(false);
    expect(result.raw).toContain("did not create");
  });

  it("returns coverage percentage for go", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "ok example.com/pkg 0.01s coverage: 72.5% of statements",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureCoverage("go", "/test/project");

    expect(result.metric).toBe("test_coverage");
    expect(result.tool).toBe("go test");
    expect(result.value).toBe(72.5);
    expect(result.success).toBe(true);
  });

  it("uses extended timeout (120s)", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    await measureCoverage("typescript", "/test/project");

    expect(mockRunTool).toHaveBeenCalledWith({
      command: expect.any(Array),
      cwd: "/test/project",
      timeout: 120000,
    });
  });

  it("handles tool not found", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "c8: command not found",
      exitCode: 127,
      timedOut: false,
    });

    const result = await measureCoverage("typescript", "/test/project");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
  });

  it("handles timeout", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: -1,
      timedOut: true,
    });

    const result = await measureCoverage("typescript", "/test/project");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
    expect(result.raw).toContain("timed out");
  });

  it("normalizes value to 0-100 range", async () => {
    // Even if tests fail, if we get coverage output we use it
    mockRunTool.mockResolvedValue({
      stdout: "All files | 45.3 |",
      stderr: "",
      exitCode: 1, // Tests failed but coverage still reported
      timedOut: false,
    });

    const result = await measureCoverage("typescript", "/test/project");

    expect(result.value).toBe(45.3);
    expect(result.success).toBe(true);
  });
});
