/**
 * Lint Error Measurement
 * Measures lint errors across supported languages
 */

import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricResult, MetricParser } from "./types.js";
import { runTool } from "./runner.js";

/**
 * Linter tool configuration for a language
 */
interface LinterTool {
  /** Tool name */
  tool: string;
  /** Command to execute */
  command: string[];
  /** Parser function to extract error count from output */
  parseErrors: MetricParser;
}

/**
 * Parse ESLint JSON output to extract error count
 * ESLint JSON format: [{ errorCount: N, warningCount: M, ... }, ...]
 */
export function parseEslintJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const results = JSON.parse(stdout);
    if (!Array.isArray(results)) {
      return -1;
    }
    return results.reduce(
      (total: number, file: { errorCount?: number }) =>
        total + (file.errorCount ?? 0),
      0
    );
  } catch {
    // If JSON parsing fails, try to extract from text output
    return -1;
  }
}

/**
 * Parse Ruff JSON output to extract error count
 * Ruff JSON format: array of diagnostic objects
 */
export function parseRuffJson(
  stdout: string,
  _stderr: string,
  exitCode: number
): number {
  if (!stdout.trim()) {
    return exitCode === 0 ? 0 : -1;
  }

  try {
    const diagnostics = JSON.parse(stdout);
    if (!Array.isArray(diagnostics)) {
      return -1;
    }
    return diagnostics.length === 0 && exitCode !== 0 ? -1 : diagnostics.length;
  } catch {
    return -1;
  }
}

/**
 * Parse golangci-lint JSON output to extract error count
 * golangci-lint JSON format: { Issues: [...] }
 */
export function parseGolangciLintJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const result = JSON.parse(stdout);
    if (result.Issues && Array.isArray(result.Issues)) {
      return result.Issues.length;
    }
    return 0;
  } catch {
    return -1;
  }
}

/**
 * Parse checkstyle XML output to extract error count
 * Counts <error> elements in the XML output
 */
export function parseCheckstyleOutput(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  // Count <error occurrences in XML
  const errorMatches = stdout.match(/<error\s/g);
  return errorMatches ? errorMatches.length : 0;
}

/**
 * Parse SwiftLint JSON output to extract error count
 * SwiftLint JSON format: array of violation objects
 */
export function parseSwiftlintJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const violations = JSON.parse(stdout);
    if (!Array.isArray(violations)) {
      return -1;
    }
    // Count only errors, not warnings
    return violations.filter(
      (v: { severity?: string }) => v.severity === "error"
    ).length;
  } catch {
    return -1;
  }
}

/**
 * Parse ktlint JSON output to extract error count
 * ktlint JSON format: array of file objects with errors array
 */
export function parseKtlintJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const results = JSON.parse(stdout);
    if (!Array.isArray(results)) {
      return -1;
    }
    return results.reduce(
      (total: number, file: { errors?: unknown[] }) =>
        total + (file.errors?.length ?? 0),
      0
    );
  } catch {
    return -1;
  }
}

/**
 * Parse RuboCop JSON output to extract error count
 * RuboCop JSON format: { files: [{ offenses: [...] }, ...] }
 */
export function parseRubocopJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const result = JSON.parse(stdout);
    if (!result.files || !Array.isArray(result.files)) {
      return -1;
    }
    return result.files.reduce(
      (total: number, file: { offenses?: unknown[] }) =>
        total + (file.offenses?.length ?? 0),
      0
    );
  } catch {
    return -1;
  }
}

/**
 * Parse PHPCS JSON output to extract error count
 * PHPCS JSON format: { files: { [path]: { errors: N, ... }, ... }, totals: { errors: N } }
 */
export function parsePhpcsJson(
  stdout: string,
  _stderr: string,
  _exitCode: number
): number {
  if (!stdout.trim()) {
    return 0;
  }

  try {
    const result = JSON.parse(stdout);
    if (result.totals && typeof result.totals.errors === "number") {
      return result.totals.errors;
    }
    return -1;
  } catch {
    return -1;
  }
}

/**
 * Parse Android Lint text output for error count
 * Looks for "N errors" summary pattern in output
 */
export function parseAndroidLintOutput(
  stdout: string,
  stderr: string,
  _exitCode: number
): number {
  const combined = stdout + stderr;

  // Look for summary pattern: "N errors, M warnings"
  const summaryMatch = combined.match(/(\d+)\s+errors?/);
  if (summaryMatch) {
    return parseInt(summaryMatch[1], 10);
  }

  // Count individual "Error:" lines
  const errorLines = combined.match(/Error:/g);
  if (errorLines) {
    return errorLines.length;
  }

  // If lint ran successfully but no errors found
  return 0;
}

/**
 * Linter tool configurations for each supported language
 */
export const LINTER_TOOLS: Record<SupportedLanguage, LinterTool> = {
  typescript: {
    tool: "eslint",
    command: ["npx", "eslint", ".", "--format", "json"],
    parseErrors: parseEslintJson,
  },
  javascript: {
    tool: "eslint",
    command: ["npx", "eslint", ".", "--format", "json"],
    parseErrors: parseEslintJson,
  },
  python: {
    tool: "ruff",
    command: ["uv", "run", "--python", "3.14", "ruff", "check", ".", "--output-format", "json"],
    parseErrors: parseRuffJson,
  },
  go: {
    tool: "golangci-lint",
    command: ["golangci-lint", "run", "--out-format", "json"],
    parseErrors: parseGolangciLintJson,
  },
  java: {
    tool: "checkstyle",
    command: [
      "checkstyle",
      "-c",
      "/google_checks.xml",
      "-f",
      "xml",
      "src/main/java",
    ],
    parseErrors: parseCheckstyleOutput,
  },
  swift: {
    tool: "swiftlint",
    command: ["swiftlint", "lint", "--reporter", "json"],
    parseErrors: parseSwiftlintJson,
  },
  kotlin: {
    tool: "ktlint",
    command: ["ktlint", "--reporter=json"],
    parseErrors: parseKtlintJson,
  },
  ruby: {
    tool: "rubocop",
    command: ["rubocop", "--format", "json"],
    parseErrors: parseRubocopJson,
  },
  php: {
    tool: "phpcs",
    command: ["phpcs", "--report=json", "."],
    parseErrors: parsePhpcsJson,
  },
};

/**
 * Measure lint errors for a specific language in a directory
 *
 * @param language - The language to measure lint errors for
 * @param directory - The directory to run the linter in
 * @returns Promise resolving to MetricResult with error count
 *
 * @example
 * ```ts
 * const result = await measureLintErrors("typescript", "/path/to/project");
 * if (result.success) {
 *   console.log(`Found ${result.value} lint errors`);
 * }
 * ```
 */
export async function measureLintErrors(
  languageOrDetected: SupportedLanguage | DetectedLanguage,
  directory: string
): Promise<MetricResult> {
  // Normalize input
  const detected: DetectedLanguage | undefined =
    typeof languageOrDetected === "string" ? undefined : languageOrDetected;
  const language: SupportedLanguage =
    typeof languageOrDetected === "string" ? languageOrDetected : languageOrDetected.language;

  // For Gradle Java/Kotlin projects, use Android Lint
  if (detected?.buildSystem === "gradle" && (language === "java" || language === "kotlin")) {
    const result = await runTool({
      command: ["./gradlew", "lint"],
      cwd: directory,
      timeout: 180000, // 3 minutes for Gradle lint
    });

    if (result.exitCode === 127) {
      return {
        metric: "lint_errors",
        tool: "android-lint",
        value: -1,
        success: false,
        raw: result.stderr || "gradlew not found",
      };
    }

    if (result.timedOut) {
      return {
        metric: "lint_errors",
        tool: "android-lint",
        value: -1,
        success: false,
        raw: "Android Lint timed out",
      };
    }

    const errorCount = parseAndroidLintOutput(result.stdout, result.stderr, result.exitCode);

    return {
      metric: "lint_errors",
      tool: "android-lint",
      value: errorCount,
      success: true,
      raw: result.stdout,
    };
  }

  const linterTool = LINTER_TOOLS[language];

  const toolResult = await runTool({
    command: linterTool.command,
    cwd: directory,
    timeout: 120000, // 2 minute timeout for linting
  });

  // Tool not found (exit code 127)
  if (toolResult.exitCode === 127) {
    return {
      metric: "lint_errors",
      tool: linterTool.tool,
      value: -1,
      success: false,
      raw: toolResult.stderr,
    };
  }

  // Timeout
  if (toolResult.timedOut) {
    return {
      metric: "lint_errors",
      tool: linterTool.tool,
      value: -1,
      success: false,
      raw: "Linter timed out",
    };
  }

  // Parse the output to get error count
  const errorCount = linterTool.parseErrors(
    toolResult.stdout,
    toolResult.stderr,
    toolResult.exitCode
  );

  // Parser returned -1 means parsing failed
  if (errorCount === -1) {
    return {
      metric: "lint_errors",
      tool: linterTool.tool,
      value: -1,
      success: false,
      raw: toolResult.stdout || toolResult.stderr,
    };
  }

  return {
    metric: "lint_errors",
    tool: linterTool.tool,
    value: errorCount,
    success: true,
    raw: toolResult.stdout,
  };
}
