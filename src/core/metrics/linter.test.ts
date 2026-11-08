/**
 * Linter Measurement Tests
 * Tests for lint error measurement functionality
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  LINTER_TOOLS,
  measureLintErrors,
  parseEslintJson,
  parseRuffJson,
  parseGolangciLintJson,
  parseCheckstyleOutput,
  parseSwiftlintJson,
  parseKtlintJson,
  parseRubocopJson,
  parsePhpcsJson,
  parseAndroidLintOutput,
} from "./linter.js";
import * as runner from "./runner.js";

// Mock the runner module
vi.mock("./runner.js", () => ({
  runTool: vi.fn(),
}));

describe("LINTER_TOOLS", () => {
  it("should define eslint for typescript", () => {
    expect(LINTER_TOOLS.typescript).toBeDefined();
    expect(LINTER_TOOLS.typescript.tool).toBe("eslint");
    expect(LINTER_TOOLS.typescript.command).toContain("eslint");
  });

  it("should define eslint for javascript", () => {
    expect(LINTER_TOOLS.javascript).toBeDefined();
    expect(LINTER_TOOLS.javascript.tool).toBe("eslint");
  });

  it("should define ruff for python", () => {
    expect(LINTER_TOOLS.python).toBeDefined();
    expect(LINTER_TOOLS.python.tool).toBe("ruff");
    expect(LINTER_TOOLS.python.command).toContain("ruff");
  });

  it("should define golangci-lint for go", () => {
    expect(LINTER_TOOLS.go).toBeDefined();
    expect(LINTER_TOOLS.go.tool).toBe("golangci-lint");
  });

  it("should define checkstyle for java", () => {
    expect(LINTER_TOOLS.java).toBeDefined();
    expect(LINTER_TOOLS.java.tool).toBe("checkstyle");
  });

  it("should define swiftlint for swift", () => {
    expect(LINTER_TOOLS.swift).toBeDefined();
    expect(LINTER_TOOLS.swift.tool).toBe("swiftlint");
  });

  it("should define ktlint for kotlin", () => {
    expect(LINTER_TOOLS.kotlin).toBeDefined();
    expect(LINTER_TOOLS.kotlin.tool).toBe("ktlint");
  });

  it("should define rubocop for ruby", () => {
    expect(LINTER_TOOLS.ruby).toBeDefined();
    expect(LINTER_TOOLS.ruby.tool).toBe("rubocop");
  });

  it("should define phpcs for php", () => {
    expect(LINTER_TOOLS.php).toBeDefined();
    expect(LINTER_TOOLS.php.tool).toBe("phpcs");
  });

  it("should have all 9 supported languages defined", () => {
    const languages = [
      "typescript",
      "javascript",
      "python",
      "go",
      "java",
      "swift",
      "kotlin",
      "ruby",
      "php",
    ];
    for (const lang of languages) {
      expect(
        LINTER_TOOLS[lang as keyof typeof LINTER_TOOLS],
        `${lang} should have linter defined`
      ).toBeDefined();
    }
  });
});

describe("parseEslintJson", () => {
  it("should parse ESLint JSON output correctly", () => {
    const eslintOutput = JSON.stringify([
      {
        filePath: "/src/file1.ts",
        errorCount: 3,
        warningCount: 2,
        messages: [],
      },
      {
        filePath: "/src/file2.ts",
        errorCount: 1,
        warningCount: 0,
        messages: [],
      },
    ]);

    const result = parseEslintJson(eslintOutput, "", 1);
    expect(result).toBe(4); // 3 + 1
  });

  it("should return 0 for empty output", () => {
    expect(parseEslintJson("", "", 0)).toBe(0);
    expect(parseEslintJson("   ", "", 0)).toBe(0);
  });

  it("should return 0 for clean project", () => {
    const cleanOutput = JSON.stringify([
      { filePath: "/src/file1.ts", errorCount: 0, warningCount: 0 },
    ]);

    const result = parseEslintJson(cleanOutput, "", 0);
    expect(result).toBe(0);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseEslintJson("not json", "", 1)).toBe(-1);
  });

  it("should return -1 for non-array JSON", () => {
    expect(parseEslintJson('{"error": true}', "", 1)).toBe(-1);
  });
});

describe("parseRuffJson", () => {
  it("should parse Ruff JSON output correctly", () => {
    const ruffOutput = JSON.stringify([
      { code: "E501", message: "Line too long" },
      { code: "F401", message: "Unused import" },
      { code: "F841", message: "Unused variable" },
    ]);

    const result = parseRuffJson(ruffOutput, "", 1);
    expect(result).toBe(3);
  });

  it("should return 0 for empty array", () => {
    expect(parseRuffJson("[]", "", 0)).toBe(0);
  });

  it("should return 0 for empty output on a successful run", () => {
    expect(parseRuffJson("", "", 0)).toBe(0);
  });

  it("rejects startup failures instead of interpreting them as zero lint errors", () => {
    expect(parseRuffJson("", "uv failed", 1)).toBe(-1);
    expect(parseRuffJson("[]", "", 1)).toBe(-1);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseRuffJson("invalid", "", 1)).toBe(-1);
  });
});

describe("parseGolangciLintJson", () => {
  it("should parse golangci-lint JSON output correctly", () => {
    const golangciOutput = JSON.stringify({
      Issues: [
        { Text: "error 1", Severity: "error" },
        { Text: "error 2", Severity: "warning" },
      ],
    });

    const result = parseGolangciLintJson(golangciOutput, "", 1);
    expect(result).toBe(2);
  });

  it("should return 0 for empty Issues array", () => {
    const cleanOutput = JSON.stringify({ Issues: [] });
    expect(parseGolangciLintJson(cleanOutput, "", 0)).toBe(0);
  });

  it("should return 0 for no Issues key", () => {
    expect(parseGolangciLintJson('{"Report": {}}', "", 0)).toBe(0);
  });

  it("should return 0 for empty output", () => {
    expect(parseGolangciLintJson("", "", 0)).toBe(0);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseGolangciLintJson("not json", "", 1)).toBe(-1);
  });
});

describe("parseCheckstyleOutput", () => {
  it("should count error elements in XML output", () => {
    const xmlOutput = `<?xml version="1.0"?>
<checkstyle>
  <file name="File1.java">
    <error line="1" column="1" severity="error" message="msg1"/>
    <error line="2" column="1" severity="error" message="msg2"/>
  </file>
  <file name="File2.java">
    <error line="5" severity="error" message="msg3"/>
  </file>
</checkstyle>`;

    const result = parseCheckstyleOutput(xmlOutput, "", 1);
    expect(result).toBe(3);
  });

  it("should return 0 for clean output", () => {
    const cleanXml = `<?xml version="1.0"?><checkstyle></checkstyle>`;
    expect(parseCheckstyleOutput(cleanXml, "", 0)).toBe(0);
  });

  it("should return 0 for empty output", () => {
    expect(parseCheckstyleOutput("", "", 0)).toBe(0);
  });
});

describe("parseSwiftlintJson", () => {
  it("should count only errors, not warnings", () => {
    const swiftlintOutput = JSON.stringify([
      { severity: "error", reason: "error 1" },
      { severity: "warning", reason: "warning 1" },
      { severity: "error", reason: "error 2" },
    ]);

    const result = parseSwiftlintJson(swiftlintOutput, "", 1);
    expect(result).toBe(2); // Only errors
  });

  it("should return 0 for empty array", () => {
    expect(parseSwiftlintJson("[]", "", 0)).toBe(0);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseSwiftlintJson("invalid", "", 1)).toBe(-1);
  });
});

describe("parseKtlintJson", () => {
  it("should sum errors across files", () => {
    const ktlintOutput = JSON.stringify([
      { file: "File1.kt", errors: [{ line: 1 }, { line: 2 }] },
      { file: "File2.kt", errors: [{ line: 3 }] },
    ]);

    const result = parseKtlintJson(ktlintOutput, "", 1);
    expect(result).toBe(3);
  });

  it("should return 0 for files with no errors", () => {
    const cleanOutput = JSON.stringify([{ file: "File.kt", errors: [] }]);
    expect(parseKtlintJson(cleanOutput, "", 0)).toBe(0);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseKtlintJson("invalid", "", 1)).toBe(-1);
  });
});

describe("parseRubocopJson", () => {
  it("should sum offenses across files", () => {
    const rubocopOutput = JSON.stringify({
      files: [
        { path: "file1.rb", offenses: [{ cop_name: "Style/Foo" }] },
        {
          path: "file2.rb",
          offenses: [{ cop_name: "Lint/Bar" }, { cop_name: "Style/Baz" }],
        },
      ],
    });

    const result = parseRubocopJson(rubocopOutput, "", 1);
    expect(result).toBe(3);
  });

  it("should return 0 for clean output", () => {
    const cleanOutput = JSON.stringify({ files: [{ path: "a.rb", offenses: [] }] });
    expect(parseRubocopJson(cleanOutput, "", 0)).toBe(0);
  });

  it("should return -1 for missing files key", () => {
    expect(parseRubocopJson('{"summary": {}}', "", 0)).toBe(-1);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parseRubocopJson("invalid", "", 1)).toBe(-1);
  });
});

describe("parsePhpcsJson", () => {
  it("should extract error count from totals", () => {
    const phpcsOutput = JSON.stringify({
      totals: { errors: 5, warnings: 3 },
      files: {},
    });

    const result = parsePhpcsJson(phpcsOutput, "", 1);
    expect(result).toBe(5);
  });

  it("should return 0 for clean output", () => {
    const cleanOutput = JSON.stringify({ totals: { errors: 0, warnings: 0 } });
    expect(parsePhpcsJson(cleanOutput, "", 0)).toBe(0);
  });

  it("should return -1 for missing totals", () => {
    expect(parsePhpcsJson('{"files": {}}', "", 0)).toBe(-1);
  });

  it("should return -1 for invalid JSON", () => {
    expect(parsePhpcsJson("invalid", "", 1)).toBe(-1);
  });
});

describe("parseAndroidLintOutput", () => {
  it("should parse N errors summary pattern", () => {
    const output = `Ran lint on variant debug: 5 errors, 10 warnings`;
    expect(parseAndroidLintOutput(output, "", 1)).toBe(5);
  });

  it("should parse single error", () => {
    const output = `Ran lint on variant debug: 1 error, 3 warnings`;
    expect(parseAndroidLintOutput(output, "", 1)).toBe(1);
  });

  it("should count Error: lines as fallback", () => {
    const output = `
Error: Some lint issue [LintId]
Error: Another lint issue [LintId]
`;
    expect(parseAndroidLintOutput(output, "", 1)).toBe(2);
  });

  it("should return 0 for clean lint output", () => {
    const output = `Ran lint on variant debug: 0 errors, 0 warnings`;
    expect(parseAndroidLintOutput(output, "", 0)).toBe(0);
  });

  it("should check stderr too", () => {
    expect(parseAndroidLintOutput("", "3 errors found", 1)).toBe(3);
  });
});

describe("measureLintErrors", () => {
  const mockRunTool = runner.runTool as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return successful result with error count for typescript", async () => {
    const eslintOutput = JSON.stringify([
      { filePath: "a.ts", errorCount: 2, warningCount: 0 },
    ]);

    mockRunTool.mockResolvedValueOnce({
      stdout: eslintOutput,
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureLintErrors("typescript", "/test/dir");

    expect(result.success).toBe(true);
    expect(result.metric).toBe("lint_errors");
    expect(result.tool).toBe("eslint");
    expect(result.value).toBe(2);
  });

  it("should return successful result for python with ruff", async () => {
    const ruffOutput = JSON.stringify([{ code: "E501" }, { code: "F401" }]);

    mockRunTool.mockResolvedValueOnce({
      stdout: ruffOutput,
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureLintErrors("python", "/test/dir");

    expect(result.success).toBe(true);
    expect(result.tool).toBe("ruff");
    expect(result.value).toBe(2);
  });

  it("should return successful result for go with golangci-lint", async () => {
    const golangciOutput = JSON.stringify({
      Issues: [{ Text: "issue 1" }],
    });

    mockRunTool.mockResolvedValueOnce({
      stdout: golangciOutput,
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureLintErrors("go", "/test/dir");

    expect(result.success).toBe(true);
    expect(result.tool).toBe("golangci-lint");
    expect(result.value).toBe(1);
  });

  it("should handle tool not found gracefully (exit code 127)", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "",
      stderr: "eslint: command not found",
      exitCode: 127,
      timedOut: false,
    });

    const result = await measureLintErrors("typescript", "/test/dir");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
    expect(result.raw).toContain("command not found");
  });

  it("should handle timeout gracefully", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "",
      stderr: "",
      exitCode: -1,
      timedOut: true,
    });

    const result = await measureLintErrors("python", "/test/dir");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
    expect(result.raw).toBe("Linter timed out");
  });

  it("should handle invalid JSON output gracefully", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "not valid json output",
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureLintErrors("typescript", "/test/dir");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
  });

  it("should return 0 errors for clean project", async () => {
    const cleanOutput = JSON.stringify([
      { filePath: "a.ts", errorCount: 0, warningCount: 0 },
    ]);

    mockRunTool.mockResolvedValueOnce({
      stdout: cleanOutput,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureLintErrors("typescript", "/test/dir");

    expect(result.success).toBe(true);
    expect(result.value).toBe(0);
  });

  it("should pass correct working directory to runTool", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "[]",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    await measureLintErrors("python", "/my/project/dir");

    expect(mockRunTool).toHaveBeenCalledWith({
      command: expect.arrayContaining(["ruff"]),
      cwd: "/my/project/dir",
      timeout: 120000,
    });
  });

  it("should use Android Lint for Gradle Java projects", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: "Ran lint on variant debug: 3 errors, 5 warnings",
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureLintErrors(
      { language: "java", confidence: "high", markers: ["build.gradle"], buildSystem: "gradle", isAndroid: true },
      "/test/dir"
    );

    expect(mockRunTool).toHaveBeenCalledWith({
      command: ["./gradlew", "lint"],
      cwd: "/test/dir",
      timeout: 180000,
    });
    expect(result.success).toBe(true);
    expect(result.tool).toBe("android-lint");
    expect(result.value).toBe(3);
  });

  it("should fall back to checkstyle for Java without Gradle", async () => {
    mockRunTool.mockResolvedValueOnce({
      stdout: `<?xml version="1.0"?><checkstyle></checkstyle>`,
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureLintErrors("java", "/test/dir");

    expect(mockRunTool).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining(["checkstyle"]),
      })
    );
    expect(result.tool).toBe("checkstyle");
  });
});
