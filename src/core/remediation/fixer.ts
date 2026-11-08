/**
 * Auto-fix Execution
 * Delegates to language-specific fix tools
 */

import type { SupportedLanguage } from "../types.js";
import { runTool } from "../metrics/runner.js";

/**
 * Result of a fix operation
 */
export interface FixResult {
  /** Whether the fix operation completed successfully */
  success: boolean;
  /** Number of files modified */
  filesModified: number;
  /** Human-readable message about the fix result */
  message: string;
  /** The tool used for fixing */
  tool: string;
}

/**
 * Fix tool configuration for a language
 */
interface FixTool {
  /** Tool name */
  tool: string;
  /** Command to execute */
  command: string[];
  /** Parser function to extract result from output */
  parseOutput: (stdout: string, stderr: string, exitCode: number) => FixResult;
}

/**
 * Parse ESLint fix output to extract file count
 * ESLint with --fix doesn't report file count in a structured way,
 * so we check if it ran successfully
 */
export function parseEslintFixOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  // ESLint returns 0 on success (no errors remaining)
  // or 1 if there are unfixable errors
  if (exitCode === 0) {
    return {
      success: true,
      filesModified: -1, // ESLint doesn't report count
      message: "ESLint fix completed successfully",
      tool: "eslint",
    };
  }

  // ESLint ran but has unfixable errors
  return {
    success: true, // Fix still ran, just couldn't fix everything
    filesModified: -1,
    message: "ESLint fix completed with remaining unfixable issues",
    tool: "eslint",
  };
}

/**
 * Parse Ruff fix output
 * Ruff reports fixed files in its output
 */
export function parseRuffFixOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  // Ruff outputs "Fixed N errors in M files" or similar
  const fixedMatch = stderr.match(/Fixed (\d+) errors?/i);
  const fileMatch = stderr.match(/in (\d+) files?/i);

  const filesModified = fileMatch ? parseInt(fileMatch[1], 10) : -1;

  if (exitCode === 0 || fixedMatch) {
    return {
      success: true,
      filesModified,
      message: fixedMatch
        ? `Ruff fixed ${fixedMatch[1]} errors`
        : "Ruff fix completed",
      tool: "ruff",
    };
  }

  return {
    success: exitCode === 0,
    filesModified: 0,
    message: stderr || "Ruff fix completed",
    tool: "ruff",
  };
}

/**
 * Parse gofmt output
 * gofmt -w modifies files in place, no output on success
 */
export function parseGofmtOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  if (exitCode === 0) {
    return {
      success: true,
      filesModified: -1, // gofmt doesn't report count
      message: "gofmt completed successfully",
      tool: "gofmt",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || "gofmt failed",
    tool: "gofmt",
  };
}

/**
 * Parse SwiftFormat output
 */
export function parseSwiftformatOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  if (exitCode === 0) {
    // SwiftFormat may output formatted file paths
    const lines = stdout.trim().split("\n").filter((l) => l.trim());
    return {
      success: true,
      filesModified: lines.length > 0 ? lines.length : -1,
      message: "SwiftFormat completed successfully",
      tool: "swiftformat",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || "SwiftFormat failed",
    tool: "swiftformat",
  };
}

/**
 * Parse ktlint format output
 */
export function parseKtlintFormatOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  if (exitCode === 0) {
    return {
      success: true,
      filesModified: -1,
      message: "ktlint format completed successfully",
      tool: "ktlint",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || "ktlint format failed",
    tool: "ktlint",
  };
}

/**
 * Parse RuboCop auto-correct output
 */
export function parseRubocopFixOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  // RuboCop outputs "N files inspected, N offenses detected, N offenses corrected"
  const correctedMatch = stdout.match(/(\d+) offenses? corrected/i);
  const filesMatch = stdout.match(/(\d+) files? inspected/i);

  if (exitCode === 0 || correctedMatch) {
    return {
      success: true,
      filesModified: filesMatch ? parseInt(filesMatch[1], 10) : -1,
      message: correctedMatch
        ? `RuboCop corrected ${correctedMatch[1]} offenses`
        : "RuboCop auto-correct completed",
      tool: "rubocop",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || stdout || "RuboCop auto-correct failed",
    tool: "rubocop",
  };
}

/**
 * Parse PHP-CS-Fixer output
 */
export function parsePhpCsFixerOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  // PHP-CS-Fixer outputs file paths it fixed
  const lines = stdout.trim().split("\n").filter((l) => l.includes(".php"));

  if (exitCode === 0) {
    return {
      success: true,
      filesModified: lines.length > 0 ? lines.length : -1,
      message:
        lines.length > 0
          ? `PHP-CS-Fixer fixed ${lines.length} files`
          : "PHP-CS-Fixer completed",
      tool: "php-cs-fixer",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || "PHP-CS-Fixer failed",
    tool: "php-cs-fixer",
  };
}

/**
 * Parse google-java-format output
 */
export function parseGoogleJavaFormatOutput(
  stdout: string,
  stderr: string,
  exitCode: number
): FixResult {
  if (exitCode === 0) {
    return {
      success: true,
      filesModified: -1,
      message: "google-java-format completed successfully",
      tool: "google-java-format",
    };
  }

  return {
    success: false,
    filesModified: 0,
    message: stderr || "google-java-format failed",
    tool: "google-java-format",
  };
}

/**
 * Fix tool configurations for each supported language
 */
export const FIX_TOOLS: Record<SupportedLanguage, FixTool> = {
  typescript: {
    tool: "eslint",
    command: ["npx", "eslint", ".", "--fix"],
    parseOutput: parseEslintFixOutput,
  },
  javascript: {
    tool: "eslint",
    command: ["npx", "eslint", ".", "--fix"],
    parseOutput: parseEslintFixOutput,
  },
  python: {
    tool: "ruff",
    command: ["uv", "run", "--python", "3.14", "ruff", "check", ".", "--fix"],
    parseOutput: parseRuffFixOutput,
  },
  go: {
    tool: "gofmt",
    command: ["gofmt", "-w", "."],
    parseOutput: parseGofmtOutput,
  },
  java: {
    tool: "google-java-format",
    command: [
      "google-java-format",
      "--replace",
      "--glob",
      "**/*.java",
    ],
    parseOutput: parseGoogleJavaFormatOutput,
  },
  swift: {
    tool: "swiftformat",
    command: ["swiftformat", "."],
    parseOutput: parseSwiftformatOutput,
  },
  kotlin: {
    tool: "ktlint",
    command: ["ktlint", "--format"],
    parseOutput: parseKtlintFormatOutput,
  },
  ruby: {
    tool: "rubocop",
    command: ["rubocop", "--autocorrect"],
    parseOutput: parseRubocopFixOutput,
  },
  php: {
    tool: "php-cs-fixer",
    command: ["php-cs-fixer", "fix", "."],
    parseOutput: parsePhpCsFixerOutput,
  },
};

/**
 * Run fix tool for a specific language in a directory
 *
 * @param language - The language to run fix for
 * @param directory - The directory to run the fixer in
 * @returns Promise resolving to FixResult
 *
 * @example
 * ```ts
 * const result = await runFix("typescript", "/path/to/project");
 * if (result.success) {
 *   console.log(result.message);
 * }
 * ```
 */
export async function runFix(
  language: SupportedLanguage,
  directory: string
): Promise<FixResult> {
  const fixTool = FIX_TOOLS[language];

  const toolResult = await runTool({
    command: fixTool.command,
    cwd: directory,
    timeout: 120000, // 2 minute timeout for fixing
  });

  // Tool not found (exit code 127)
  if (toolResult.exitCode === 127) {
    return {
      success: false,
      filesModified: 0,
      message: `${fixTool.tool} not found. Install it to enable auto-fix.`,
      tool: fixTool.tool,
    };
  }

  // Timeout
  if (toolResult.timedOut) {
    return {
      success: false,
      filesModified: 0,
      message: `${fixTool.tool} timed out`,
      tool: fixTool.tool,
    };
  }

  // Parse the output
  return fixTool.parseOutput(
    toolResult.stdout,
    toolResult.stderr,
    toolResult.exitCode
  );
}
