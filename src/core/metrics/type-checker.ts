/**
 * Type Strictness Measurement
 * Runs type checkers (tsc, Pyrefly, go vet) and counts errors
 */

import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricResult, MetricParser } from "./types.js";
import { runTool } from "./runner.js";

/**
 * Type checker tool configuration for a language
 */
export interface TypeCheckerTool {
  /** Tool name for display */
  tool: string;
  /** Command to execute */
  command: string[];
  /** Parser to extract error count from output */
  parseErrors: MetricParser;
}

/**
 * Parse tsc (TypeScript compiler) output for error count
 *
 * Matches patterns like:
 * - "src/foo.ts(10,5): error TS2345: ..."
 * - "Found 5 errors."
 */
export function parseTscErrors(
  stdout: string,
  stderr: string,
  exitCode: number
): number {
  if (exitCode === 0) {
    return 0;
  }

  const combined = stdout + stderr;

  // Check for "Found N error(s)" summary line
  const summaryMatch = combined.match(/Found (\d+) errors?/i);
  if (summaryMatch) {
    return parseInt(summaryMatch[1], 10);
  }

  // Count individual error lines
  const errorLines = combined.match(/error TS\d+:/g);
  return errorLines ? errorLines.length : 0;
}

/**
 * Parse machine-readable Pyrefly JSON; malformed evidence is unavailable.
 */
export function parsePyreflyErrors(stdout: string, _stderr: string, exitCode: number): number {
  if (exitCode === 127) return -1;
  try {
    const data: unknown = JSON.parse(stdout);
    if (!data || typeof data !== "object" || !("errors" in data)) return -1;
    const errors = (data as { errors: unknown }).errors;
    if (!Array.isArray(errors)) return -1;
    if (errors.some((item) => !item || typeof item !== "object" ||
      typeof (item as { severity?: unknown }).severity !== "string")) return -1;
    const count = errors.filter((item) =>
      (item as { severity: string }).severity.toLowerCase() === "error"
    ).length;
    return exitCode !== 0 && count === 0 ? -1 : count;
  } catch {
    return -1;
  }
}

/**
 * Parse go vet output for error count
 *
 * Matches patterns like:
 * - "./main.go:10:5: ..."
 * - "# pkg/foo" (package header, not an error)
 */
export function parseGoVetErrors(
  stdout: string,
  stderr: string,
  exitCode: number
): number {
  if (exitCode === 0) {
    return 0;
  }

  const combined = stdout + stderr;

  // Count lines matching .go:line:col pattern (excluding package headers)
  const errorLines = combined.split("\n").filter((line) => {
    // Match: path.go:line:col: message
    return /\.go:\d+:\d*:/.test(line);
  });

  return errorLines.length;
}

/**
 * Parse Gradle Java compilation output for error count
 * Counts ": error:" patterns in combined output
 */
export function parseGradleBuildErrors(
  stdout: string,
  stderr: string,
  exitCode: number
): number {
  if (exitCode === 0) return 0;
  const combined = stdout + stderr;
  const errorLines = combined.match(/: error:/g);
  return errorLines ? errorLines.length : 0;
}

/**
 * Mapping of languages to their type checker tools
 * null means the language is dynamically typed with no standard type checker
 */
export const TYPE_CHECKER_TOOLS: Record<
  SupportedLanguage,
  TypeCheckerTool | null
> = {
  typescript: {
    tool: "tsc",
    command: ["npx", "tsc", "--noEmit"],
    parseErrors: parseTscErrors,
  },
  python: {
    tool: "pyrefly",
    command: ["uv", "run", "--python", "3.14", "pyrefly", "check", "--output-format=json"],
    parseErrors: parsePyreflyErrors,
  },
  go: {
    tool: "go vet",
    command: ["go", "vet", "./..."],
    parseErrors: parseGoVetErrors,
  },
  java: {
    tool: "javac",
    command: ["javac", "-Xlint:all", "-d", "/tmp", "-sourcepath", "."],
    parseErrors: (stdout, stderr, exitCode) => {
      if (exitCode === 0) return 0;
      // Count lines with "error:" in them
      const combined = stdout + stderr;
      const errorLines = combined.match(/: error:/g);
      return errorLines ? errorLines.length : 0;
    },
  },
  kotlin: {
    tool: "kotlinc",
    command: ["kotlinc", "-Werror"],
    parseErrors: (stdout, stderr, exitCode) => {
      if (exitCode === 0) return 0;
      const combined = stdout + stderr;
      const errorLines = combined.match(/: error:/g);
      return errorLines ? errorLines.length : 0;
    },
  },
  swift: {
    tool: "swiftc",
    command: ["swift", "build"],
    parseErrors: (stdout, stderr, exitCode) => {
      if (exitCode === 0) return 0;
      const combined = stdout + stderr;
      const errorLines = combined.match(/: error:/g);
      return errorLines ? errorLines.length : 0;
    },
  },
  // Dynamically typed languages - no static type checker by default
  javascript: null,
  ruby: null,
  php: null,
};

/**
 * Measure type strictness for a language by running its type checker
 *
 * @param languageOrDetected - Language string or DetectedLanguage object
 * @param directory - Project directory to check
 * @returns MetricResult with error count
 */
export async function measureTypeStrictness(
  languageOrDetected: SupportedLanguage | DetectedLanguage,
  directory: string
): Promise<MetricResult> {
  // Normalize input: accept both string and DetectedLanguage
  const detected: DetectedLanguage | undefined =
    typeof languageOrDetected === "string" ? undefined : languageOrDetected;
  const language: SupportedLanguage =
    typeof languageOrDetected === "string" ? languageOrDetected : languageOrDetected.language;

  // For Gradle Java/Kotlin projects, use Gradle compilation
  if (detected?.buildSystem === "gradle" && (language === "java" || language === "kotlin")) {
    const command = detected.isAndroid
      ? ["./gradlew", "compileDebugJavaWithJavac"]
      : ["./gradlew", "compileJava"];

    const result = await runTool({
      command,
      cwd: directory,
      timeout: 180000, // 3 minutes for Gradle builds
    });

    if (result.exitCode === 127) {
      return {
        metric: "type_strictness",
        tool: "gradle",
        value: -1,
        success: false,
        raw: result.stderr || "gradlew not found",
      };
    }

    if (result.timedOut) {
      return {
        metric: "type_strictness",
        tool: "gradle",
        value: -1,
        success: false,
        raw: "Gradle build timed out",
      };
    }

    const errorCount = parseGradleBuildErrors(result.stdout, result.stderr, result.exitCode);

    return {
      metric: "type_strictness",
      tool: "gradle",
      value: errorCount,
      success: true,
      raw: result.exitCode !== 0 ? result.stdout || result.stderr : undefined,
    };
  }

  const toolConfig = TYPE_CHECKER_TOOLS[language];

  // Dynamic languages have no type checker
  if (toolConfig === null) {
    return {
      metric: "type_strictness",
      tool: "n/a",
      value: 0,
      success: true,
    };
  }

  const { tool, command, parseErrors } = toolConfig;

  // Run the type checker
  const result = await runTool({
    command,
    cwd: directory,
    timeout: 120000, // 2 minutes for large projects
  });

  // Tool not installed
  if (result.exitCode === 127) {
    return {
      metric: "type_strictness",
      tool,
      value: -1,
      success: false,
      raw: result.stderr || `${tool} not found`,
    };
  }

  // Timeout
  if (result.timedOut) {
    return {
      metric: "type_strictness",
      tool,
      value: -1,
      success: false,
      raw: "Tool execution timed out",
    };
  }

  // Parse error count from output
  const errorCount = parseErrors(result.stdout, result.stderr, result.exitCode);
  if (errorCount < 0) {
    return {
      metric: "type_strictness",
      tool,
      value: -1,
      success: false,
      raw: result.stderr || result.stdout || "Invalid type-checker output",
    };
  }

  return {
    metric: "type_strictness",
    tool,
    value: errorCount,
    success: true,
    raw:
      result.exitCode !== 0 ? result.stdout || result.stderr : undefined,
  };
}
