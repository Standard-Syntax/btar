/**
 * Type Checker Tests
 *
 * Tests for type strictness measurement across languages
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  TYPE_CHECKER_TOOLS,
  parseTscErrors,
  parsePyreflyErrors,
  parseGoVetErrors,
  parseGradleBuildErrors,
  measureTypeStrictness,
} from "./type-checker.js";

// Mock the runner module
vi.mock("./runner.js", () => ({
  runTool: vi.fn(),
}));

import { runTool } from "./runner.js";

const mockRunTool = vi.mocked(runTool);

describe("TYPE_CHECKER_TOOLS", () => {
  describe("tool mapping", () => {
    it("maps typescript to tsc", () => {
      const config = TYPE_CHECKER_TOOLS.typescript;
      expect(config).not.toBeNull();
      expect(config?.tool).toBe("tsc");
      expect(config?.command).toEqual(["npx", "tsc", "--noEmit"]);
    });

    it("maps python to Pyrefly machine-readable checks", () => {
      const config = TYPE_CHECKER_TOOLS.python;
      expect(config).not.toBeNull();
      expect(config?.tool).toBe("pyrefly");
      expect(config?.command).toEqual(["pyrefly", "check", "--output-format=json"]);
    });

    it("maps go to go vet", () => {
      const config = TYPE_CHECKER_TOOLS.go;
      expect(config).not.toBeNull();
      expect(config?.tool).toBe("go vet");
      expect(config?.command).toEqual(["go", "vet", "./..."]);
    });

    it("returns null for javascript (dynamically typed)", () => {
      expect(TYPE_CHECKER_TOOLS.javascript).toBeNull();
    });

    it("returns null for ruby (dynamically typed)", () => {
      expect(TYPE_CHECKER_TOOLS.ruby).toBeNull();
    });

    it("returns null for php (dynamically typed)", () => {
      expect(TYPE_CHECKER_TOOLS.php).toBeNull();
    });
  });
});

describe("parseTscErrors", () => {
  it("returns 0 when exit code is 0", () => {
    const count = parseTscErrors("", "", 0);
    expect(count).toBe(0);
  });

  it("parses summary line 'Found N errors'", () => {
    const stdout = `
src/foo.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/bar.ts(20,3): error TS2322: Type 'boolean' is not assignable to type 'string'.

Found 2 errors.
`;
    const count = parseTscErrors(stdout, "", 1);
    expect(count).toBe(2);
  });

  it("counts error TS patterns when no summary", () => {
    const stdout = `
src/foo.ts(10,5): error TS2345: Argument of type 'string' is not assignable to parameter of type 'number'.
src/bar.ts(20,3): error TS2322: Type 'boolean' is not assignable to type 'string'.
src/baz.ts(5,1): error TS7006: Parameter 'x' implicitly has an 'any' type.
`;
    const count = parseTscErrors(stdout, "", 1);
    expect(count).toBe(3);
  });

  it("handles output in stderr", () => {
    const stderr = `src/index.ts(1,1): error TS1005: ')' expected.`;
    const count = parseTscErrors("", stderr, 1);
    expect(count).toBe(1);
  });
});

describe("parsePyreflyErrors", () => {
  it("counts error severity but not warnings", () => {
    const output = JSON.stringify({ errors: [
      { severity: "error" }, { severity: "warn" }, { severity: "error" },
    ] });
    expect(parsePyreflyErrors(output, "", 1)).toBe(2);
  });

  it("accepts a clean machine-readable check", () => {
    expect(parsePyreflyErrors('{"errors":[]}', "", 0)).toBe(0);
  });

  it("rejects malformed, missing, or failed data", () => {
    expect(parsePyreflyErrors("not-json", "", 1)).toBe(-1);
    expect(parsePyreflyErrors('{"errors":[]}', "", 1)).toBe(-1);
    expect(parsePyreflyErrors('{"message":"crash"}', "", 1)).toBe(-1);
    expect(parsePyreflyErrors("", "not installed", 127)).toBe(-1);
  });
});

describe("parseGoVetErrors", () => {
  it("returns 0 when exit code is 0", () => {
    const count = parseGoVetErrors("", "", 0);
    expect(count).toBe(0);
  });

  it("counts .go:line:col: patterns", () => {
    const stderr = `
# example.com/pkg
./main.go:10:5: result of fmt.Sprintf call not used
./utils.go:25:3: unreachable code
`;
    const count = parseGoVetErrors("", stderr, 1);
    expect(count).toBe(2);
  });

  it("ignores package header lines", () => {
    const stderr = `
# example.com/pkg
./main.go:10:5: unused variable
`;
    const count = parseGoVetErrors("", stderr, 1);
    expect(count).toBe(1);
  });
});

describe("parseGradleBuildErrors", () => {
  it("returns 0 when exit code is 0", () => {
    expect(parseGradleBuildErrors("BUILD SUCCESSFUL", "", 0)).toBe(0);
  });

  it("counts : error: patterns in stdout", () => {
    const stdout = `
/src/main/java/Foo.java:10: error: cannot find symbol
/src/main/java/Bar.java:20: error: incompatible types
`;
    expect(parseGradleBuildErrors(stdout, "", 1)).toBe(2);
  });

  it("counts : error: patterns in stderr", () => {
    const stderr = `/src/Foo.java:5: error: method not found`;
    expect(parseGradleBuildErrors("", stderr, 1)).toBe(1);
  });

  it("returns 0 when no error patterns found on failure", () => {
    expect(parseGradleBuildErrors("BUILD FAILED", "some other issue", 1)).toBe(0);
  });
});

describe("measureTypeStrictness", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns n/a for dynamically typed languages", async () => {
    const result = await measureTypeStrictness("javascript", "/path/to/project");

    expect(result).toEqual({
      metric: "type_strictness",
      tool: "n/a",
      value: 0,
      success: true,
    });

    // Should not call runTool for dynamic languages
    expect(mockRunTool).not.toHaveBeenCalled();
  });

  it("runs tsc for typescript and parses errors", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "src/foo.ts(1,1): error TS2345: ...\n\nFound 1 errors.",
      stderr: "",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureTypeStrictness("typescript", "/my/project");

    expect(mockRunTool).toHaveBeenCalledWith({
      command: ["npx", "tsc", "--noEmit"],
      cwd: "/my/project",
      timeout: 120000,
    });

    expect(result.metric).toBe("type_strictness");
    expect(result.tool).toBe("tsc");
    expect(result.value).toBe(1);
    expect(result.success).toBe(true);
  });

  it("returns success: false when tool not installed", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "tsc not found",
      exitCode: 127,
      timedOut: false,
    });

    const result = await measureTypeStrictness("typescript", "/my/project");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
    expect(result.tool).toBe("tsc");
    expect(result.raw).toContain("not found");
  });

  it("returns success: false when tool times out", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: -1,
      timedOut: true,
    });

    const result = await measureTypeStrictness("python", "/my/project");

    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
    expect(result.tool).toBe("pyrefly");
    expect(result.raw).toBe("Tool execution timed out");
  });

  it("does not interpret failed Python tool output as zero errors", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "fatal error", stderr: "", exitCode: 1, timedOut: false,
    });
    const result = await measureTypeStrictness("python", "/test");
    expect(result.success).toBe(false);
    expect(result.value).toBe(-1);
  });

  it("returns 0 errors when tool succeeds", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureTypeStrictness("go", "/my/project");

    expect(result.value).toBe(0);
    expect(result.success).toBe(true);
    expect(result.tool).toBe("go vet");
    expect(result.raw).toBeUndefined();
  });

  it("uses Gradle compilation for Java with gradle build system", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "BUILD SUCCESSFUL",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureTypeStrictness(
      { language: "java", confidence: "high", markers: ["build.gradle"], buildSystem: "gradle", isAndroid: false },
      "/my/project"
    );

    expect(mockRunTool).toHaveBeenCalledWith({
      command: ["./gradlew", "compileJava"],
      cwd: "/my/project",
      timeout: 180000,
    });
    expect(result.tool).toBe("gradle");
    expect(result.value).toBe(0);
    expect(result.success).toBe(true);
  });

  it("uses Android compilation for Android Gradle projects", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "/Foo.java:10: error: cannot find symbol",
      exitCode: 1,
      timedOut: false,
    });

    const result = await measureTypeStrictness(
      { language: "java", confidence: "high", markers: ["build.gradle"], buildSystem: "gradle", isAndroid: true },
      "/my/project"
    );

    expect(mockRunTool).toHaveBeenCalledWith({
      command: ["./gradlew", "compileDebugJavaWithJavac"],
      cwd: "/my/project",
      timeout: 180000,
    });
    expect(result.tool).toBe("gradle");
    expect(result.value).toBe(1);
    expect(result.success).toBe(true);
  });

  it("falls back to javac for Java without build system", async () => {
    mockRunTool.mockResolvedValue({
      stdout: "",
      stderr: "",
      exitCode: 0,
      timedOut: false,
    });

    const result = await measureTypeStrictness("java", "/my/project");

    expect(mockRunTool).toHaveBeenCalledWith(
      expect.objectContaining({
        command: expect.arrayContaining(["javac"]),
      })
    );
    expect(result.tool).toBe("javac");
  });
});
