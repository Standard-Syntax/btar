/**
 * Test Coverage Measurement
 * Measures test coverage percentage across different languages
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricResult, MetricParser } from "./types.js";
import { runTool } from "./runner.js";

/**
 * Coverage tool configuration
 */
export interface CoverageTool {
  /** Tool name for reporting */
  tool: string;
  /** Command to execute coverage measurement */
  command: string[];
  /** Parser to extract percentage from output */
  parseCoverage: MetricParser;
}

/**
 * Parse c8/nyc coverage output
 * Looks for "All files" line with percentage
 *
 * Example: "All files | 85.5 | 90.2 | 78.3 | 85.5 |"
 */
function parseC8Coverage(stdout: string, _stderr: string, exitCode: number): number {
  // If tool not found, return -1
  if (exitCode === 127) {
    return -1;
  }

  // Look for "All files" line with percentage
  // Format: "All files | XX.XX | ..."
  const allFilesMatch = stdout.match(/All files[^|]*\|\s*([\d.]+)/);
  if (allFilesMatch) {
    const value = parseFloat(allFilesMatch[1]);
    return isNaN(value) ? 0 : Math.min(100, Math.max(0, value));
  }

  // Alternative: Look for total percentage line (vitest format)
  // Format: "Coverage for all files: XX.XX%"
  const totalMatch = stdout.match(/(?:total|coverage)[^:]*:\s*([\d.]+)%/i);
  if (totalMatch) {
    const value = parseFloat(totalMatch[1]);
    return isNaN(value) ? 0 : Math.min(100, Math.max(0, value));
  }

  // If tests ran but no coverage data, return 0
  return 0;
}

/**
 * Parse SlipCover JSON. Missing data is not zero-percent coverage.
 */
export function parseSlipcoverJson(stdout: string, _stderr: string, exitCode: number): number {
  if (exitCode !== 0) return -1;
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object") return -1;
    const report = parsed as { files?: unknown; summary?: { percent_covered?: unknown } };
    if (!report.files || typeof report.files !== "object" ||
      Array.isArray(report.files) || Object.keys(report.files).length === 0) return -1;
    const percent = report.summary?.percent_covered;
    if (typeof percent !== "number" || !Number.isFinite(percent) ||
      percent < 0 || percent > 100) return -1;
    return percent;
  } catch {
    return -1;
  }
}

/**
 * Parse go test coverage output
 * Looks for "coverage: XX.X% of statements" pattern
 *
 * Example: "coverage: 72.5% of statements"
 */
function parseGoCoverage(stdout: string, _stderr: string, exitCode: number): number {
  // If tool not found, return -1
  if (exitCode === 127) {
    return -1;
  }

  // Go test outputs coverage per package. Collect all and average.
  // Format: "coverage: XX.X% of statements"
  const allMatches = stdout.matchAll(/coverage:\s*([\d.]+)%\s+of\s+statements/g);
  const percentages: number[] = [];
  for (const match of allMatches) {
    const value = parseFloat(match[1]);
    if (!isNaN(value)) {
      percentages.push(value);
    }
  }

  if (percentages.length > 0) {
    const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    return Math.min(100, Math.max(0, avg));
  }

  // Fallback: Look for any coverage percentage pattern
  const fallbackMatches = stdout.matchAll(/coverage:\s*([\d.]+)%/g);
  for (const match of fallbackMatches) {
    const value = parseFloat(match[1]);
    if (!isNaN(value)) {
      percentages.push(value);
    }
  }

  if (percentages.length > 0) {
    const avg = percentages.reduce((a, b) => a + b, 0) / percentages.length;
    return Math.min(100, Math.max(0, avg));
  }

  // "[no test files]" is common - means 0% coverage
  if (stdout.includes("[no test files]") || stdout.includes("no test files")) {
    return 0;
  }

  return 0;
}

/**
 * Parse generic coverage output
 * Looks for percentage patterns (XX% or XX.X%)
 */
function parseGenericCoverage(stdout: string, _stderr: string, exitCode: number): number {
  // If tool not found, return -1
  if (exitCode === 127) {
    return -1;
  }

  // Look for common coverage report patterns
  // "Coverage: XX.X%", "Total: XX%", "Line coverage: XX.X%"
  const patterns = [
    /(?:line\s+)?coverage[:\s]*([\d.]+)%/i,
    /total[:\s]*([\d.]+)%/i,
    /^[\s]*(\d+(?:\.\d+)?)\s*%/m,
  ];

  for (const pattern of patterns) {
    const match = stdout.match(pattern);
    if (match) {
      const value = parseFloat(match[1]);
      if (!isNaN(value)) {
        return Math.min(100, Math.max(0, value));
      }
    }
  }

  return 0;
}

/**
 * Parse JaCoCo XML report for line coverage percentage
 * Uses the LAST <counter type="LINE"> match, which is the report-level
 * aggregate in standard JaCoCo XML (method→class→package→report order).
 */
export function parseJacocoCoverage(xmlContent: string): number {
  // Find ALL LINE counters and use the last one (report-level aggregate)
  const linePattern =
    /<counter\s+type="LINE"\s+missed="(\d+)"\s+covered="(\d+)"\s*\/>/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = linePattern.exec(xmlContent)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const missed = parseInt(lastMatch[1], 10);
    const covered = parseInt(lastMatch[2], 10);
    const total = missed + covered;
    if (total === 0) return 0;
    return Math.round((covered / total) * 1000) / 10; // One decimal place
  }

  return 0;
}

/**
 * Detect the appropriate coverage tool for Java/Kotlin Gradle projects
 */
async function detectJavaCoverageTool(
  directory: string,
  detected: DetectedLanguage
): Promise<CoverageTool> {
  if (detected.buildSystem !== "gradle") {
    return COVERAGE_TOOLS.java; // Default Maven-based
  }

  // Check if there are JVM unit tests (src/test/)
  const hasJvmTests = await fileExists(path.join(directory, "src", "test"));

  if (hasJvmTests) {
    return {
      tool: "jacoco (gradle)",
      command: ["./gradlew", "test", "jacocoTestReport"],
      parseCoverage: (_stdout, _stderr, _exitCode) => {
        // Coverage is parsed from XML report file, not stdout
        // Return 0 here; actual parsing happens in measureCoverage
        return 0;
      },
    };
  }

  // For Android instrumented tests (requires emulator)
  if (detected.isAndroid) {
    return {
      tool: "jacoco (android)",
      command: ["./gradlew", "createDebugCoverageReport"],
      parseCoverage: (_stdout, _stderr, _exitCode) => {
        return 0; // Parsed from XML report
      },
    };
  }

  // Default Gradle test
  return {
    tool: "jacoco (gradle)",
    command: ["./gradlew", "test", "jacocoTestReport"],
    parseCoverage: parseGenericCoverage,
  };
}

/**
 * Coverage tools mapping by language
 */
export const COVERAGE_TOOLS: Record<SupportedLanguage, CoverageTool> = {
  typescript: {
    tool: "c8",
    command: ["npx", "c8", "--reporter=text-summary", "npm", "test"],
    parseCoverage: parseC8Coverage,
  },
  javascript: {
    tool: "c8",
    command: ["npx", "c8", "--reporter=text-summary", "npm", "test"],
    parseCoverage: parseC8Coverage,
  },
  python: {
    tool: "slipcover",
    command: ["uv", "run", "--python", "3.14", "python", "-m", "slipcover", "--json", "-m", "pytest", "-q"],
    parseCoverage: parseSlipcoverJson,
  },
  go: {
    tool: "go test",
    command: ["go", "test", "-cover", "./..."],
    parseCoverage: parseGoCoverage,
  },
  java: {
    tool: "jacoco",
    command: ["mvn", "test", "jacoco:report"],
    parseCoverage: parseGenericCoverage,
  },
  kotlin: {
    tool: "jacoco",
    command: ["./gradlew", "test", "jacocoTestReport"],
    parseCoverage: parseGenericCoverage,
  },
  swift: {
    tool: "swift test",
    command: ["swift", "test", "--enable-code-coverage"],
    parseCoverage: parseGenericCoverage,
  },
  ruby: {
    tool: "simplecov",
    command: ["bundle", "exec", "rspec", "--format", "progress"],
    parseCoverage: parseGenericCoverage,
  },
  php: {
    tool: "phpunit",
    command: ["./vendor/bin/phpunit", "--coverage-text"],
    parseCoverage: parseGenericCoverage,
  },
};

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the appropriate coverage tool for TypeScript/JavaScript projects
 * Checks for vitest, jest, or falls back to c8
 */
async function detectJsCoverageTool(directory: string): Promise<CoverageTool> {
  // Check for vitest config
  const vitestConfigs = [
    "vitest.config.ts",
    "vitest.config.js",
    "vitest.config.mts",
    "vitest.config.mjs",
  ];

  for (const config of vitestConfigs) {
    if (await fileExists(path.join(directory, config))) {
      return {
        tool: "vitest",
        command: ["npx", "vitest", "run", "--coverage"],
        parseCoverage: parseC8Coverage,
      };
    }
  }

  // Check package.json for vitest in devDependencies
  try {
    const pkgPath = path.join(directory, "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };

    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
      return {
        tool: "vitest",
        command: ["npx", "vitest", "run", "--coverage"],
        parseCoverage: parseC8Coverage,
      };
    }

    // Check for jest
    // Jest uses Istanbul format (not c8), so use parseGenericCoverage
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
      return {
        tool: "jest",
        command: ["npx", "jest", "--coverage", "--coverageReporters=text-summary"],
        parseCoverage: parseGenericCoverage,
      };
    }
  } catch {
    // Ignore errors when reading or parsing package.json.
    // This is expected if package.json is missing or malformed.
    // The detection will fall back to the default coverage tool.
  }

  // Default to c8
  return COVERAGE_TOOLS.typescript;
}

/**
 * Use a fresh temporary JSON report; reject failed tests and missing evidence.
 */
async function measurePythonCoverage(directory: string): Promise<MetricResult> {
  const tool = "slipcover";
  let tempDir: string | undefined;
  const failure = (raw: string): MetricResult => ({
    metric: "test_coverage", tool, value: -1, success: false, raw,
  });

  try {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "btar-slipcover-"));
    const output = path.join(tempDir, "coverage.json");
    const result = await runTool({
      command: ["uv", "run", "--python", "3.14", "python", "-m", "slipcover", "--json", "--out", output, "-m", "pytest", "-q"],
      cwd: directory,
      timeout: 120000,
    });

    if (result.timedOut) return failure("SlipCover timed out");
    if (result.exitCode !== 0) return failure(
      result.stderr || result.stdout || "Python tests or SlipCover failed"
    );

    let report: string;
    try {
      report = await fs.readFile(output, "utf8");
    } catch {
      return failure("SlipCover did not create its coverage report");
    }
    const value = parseSlipcoverJson(report, "", 0);
    if (value < 0) return failure("Invalid or empty SlipCover coverage report");
    return {
      metric: "test_coverage", tool, value, success: true,
      raw: result.stdout.slice(0, 1000),
    };
  } catch (error) {
    return failure(error instanceof Error ? error.message : String(error));
  } finally {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/**
 * Measure test coverage for a project
 *
 * @param language - The language to measure coverage for
 * @param directory - The directory containing the project
 * @returns MetricResult with coverage percentage (0-100) or -1 if tool unavailable
 *
 * @example
 * ```ts
 * const result = await measureCoverage("typescript", "/path/to/project");
 * if (result.success) {
 *   console.log(`Coverage: ${result.value}%`);
 * }
 * ```
 */
export async function measureCoverage(
  languageOrDetected: SupportedLanguage | DetectedLanguage,
  directory: string
): Promise<MetricResult> {
  // Normalize input
  const detected: DetectedLanguage | undefined =
    typeof languageOrDetected === "string" ? undefined : languageOrDetected;
  const language: SupportedLanguage =
    typeof languageOrDetected === "string" ? languageOrDetected : languageOrDetected.language;

  if (language === "python") return measurePythonCoverage(directory);

  // For JS/TS, detect the appropriate tool
  let toolConfig: CoverageTool;
  if (language === "typescript" || language === "javascript") {
    toolConfig = await detectJsCoverageTool(directory);
  } else if (detected && (language === "java" || language === "kotlin") && detected.buildSystem === "gradle") {
    toolConfig = await detectJavaCoverageTool(directory, detected);
  } else {
    toolConfig = COVERAGE_TOOLS[language];
  }

  // Extended timeout for coverage (runs tests, can be slow)
  const COVERAGE_TIMEOUT = 120000; // 2 minutes

  const result = await runTool({
    command: toolConfig.command,
    cwd: directory,
    timeout: COVERAGE_TIMEOUT,
  });

  // For Gradle JaCoCo, try to parse XML report file
  let value: number;
  if (detected?.buildSystem === "gradle" && (language === "java" || language === "kotlin")) {
    // Try to find and parse JaCoCo XML report
    const reportPaths = [
      path.join(directory, "build", "reports", "jacoco", "test", "jacocoTestReport.xml"),
      path.join(directory, "build", "reports", "coverage", "debug", "report.xml"),
      path.join(directory, "build", "reports", "jacoco", "jacocoTestReport.xml"),
    ];

    let xmlCoverage = 0;
    for (const reportPath of reportPaths) {
      try {
        const xmlContent = await fs.readFile(reportPath, "utf-8");
        xmlCoverage = parseJacocoCoverage(xmlContent);
        if (xmlCoverage > 0) break;
      } catch {
        // Report file not found, try next path
      }
    }

    // Use XML coverage if found, otherwise fall back to stdout parsing
    value = xmlCoverage > 0
      ? xmlCoverage
      : toolConfig.parseCoverage(result.stdout, result.stderr, result.exitCode);

    // Check for "No connected devices" error (Android tests need emulator)
    if (result.stderr.includes("No connected devices") || result.stderr.includes("DeviceException")) {
      return {
        metric: "test_coverage",
        tool: toolConfig.tool,
        value: -1,
        success: false,
        raw: "No connected Android device/emulator for instrumented tests. Use JVM tests (src/test/) instead.",
      };
    }
  } else {
    // Parse coverage percentage from output
    value = toolConfig.parseCoverage(result.stdout, result.stderr, result.exitCode);
  }

  // Tool not found
  if (value === -1) {
    return {
      metric: "test_coverage",
      tool: toolConfig.tool,
      value: -1,
      success: false,
      raw: result.stderr,
    };
  }

  // Timed out
  if (result.timedOut) {
    return {
      metric: "test_coverage",
      tool: toolConfig.tool,
      value: -1,
      success: false,
      raw: "Coverage measurement timed out",
    };
  }

  // Success - return parsed percentage
  return {
    metric: "test_coverage",
    tool: toolConfig.tool,
    value,
    success: true,
    raw: result.stdout.slice(0, 1000), // Limit raw output size
  };
}
