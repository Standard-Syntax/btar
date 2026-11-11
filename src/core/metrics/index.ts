/**
 * Metrics Module
 * Barrel export and orchestration for all metric measurements
 */

import { resolve } from "node:path";
import type { DetectedLanguage } from "../types.js";
import type { MetricResult } from "./types.js";

// Re-export all metric functions and types
export { measureTypeStrictness, TYPE_CHECKER_TOOLS } from "./type-checker.js";
export { measureLintErrors, LINTER_TOOLS } from "./linter.js";
export { measureCoverage, COVERAGE_TOOLS } from "./coverage.js";
export * from "./types.js";
export { runTool } from "./runner.js";

// Import for internal use
import { measureTypeStrictness } from "./type-checker.js";
import { measureLintErrors } from "./linter.js";
import { measureCoverage } from "./coverage.js";
import { runTool } from "./runner.js";

/**
 * Options for running all metrics
 */
export interface MetricsOptions {
  /** Directory to analyze */
  directory: string;
  /** Detected languages in the project */
  languages: DetectedLanguage[];
  /** Consent to execute repository code through Hatch and its tools. */
  trustedProject?: boolean;
  /** Progress callback */
  onProgress?: (
    metric: string,
    status: "start" | "done",
    result?: MetricResult
  ) => void;
}

/**
 * Complete metrics report for a project
 */
export interface MetricsReport {
  /** Languages that were analyzed */
  languages: DetectedLanguage[];
  /** Per-dimension metric results */
  metrics: {
    typeStrictness: Map<string, MetricResult>;
    lintErrors: Map<string, MetricResult>;
    coverage: Map<string, MetricResult>;
  };
  /** Aggregated summary */
  summary: {
    /** Total type errors across all languages */
    totalTypeErrors: number;
    /** Total lint errors across all languages */
    totalLintErrors: number;
    /** Average coverage percentage across all languages */
    averageCoverage: number;
  };
}

export function projectKey(project: DetectedLanguage): string {
  return project.projectPath === "." ? project.language : `${project.language}:${project.projectPath}`;
}

/**
 * Run all metrics for detected languages
 *
 * @param options - Metrics options including directory and languages
 * @returns Complete metrics report with per-language results and summary
 *
 * @example
 * ```ts
 * const report = await runAllMetrics({
 *   directory: "/path/to/project",
 *   languages: [{ language: "python", confidence: "high", markers: ["pyproject.toml"], buildSystem: "hatch", projectPath: "." }],
 *   trustedProject: true,
 *   onProgress: (metric, status) => console.log(`${metric}: ${status}`)
 * });
 *
 * console.log(`Type errors: ${report.summary.totalTypeErrors}`);
 * console.log(`Lint errors: ${report.summary.totalLintErrors}`);
 * console.log(`Coverage: ${report.summary.averageCoverage}%`);
 * ```
 */
export async function runAllMetrics(
  options: MetricsOptions
): Promise<MetricsReport> {
  const { directory, languages, onProgress } = options;

  // Initialize result maps
  const typeStrictness = new Map<string, MetricResult>();
  const lintErrors = new Map<string, MetricResult>();
  const coverage = new Map<string, MetricResult>();

  for (const detectedLang of languages) {
    const key = projectKey(detectedLang);
    const projectDirectory = resolve(directory, detectedLang.projectPath);
    let failure: string | undefined;
    let diagnostic: MetricResult["diagnostic"];
    if (!options.trustedProject) {
      diagnostic = "consent-required";
      failure = "Project execution requires explicit consent. Use --trust-project to allow Hatch and metric tools to execute repository code.";
    } else {
      const runtime = await runTool({
        command: ["hatch", "run", "python", "-c", "import sys; print(sys.version.split()[0]); raise SystemExit(sys.version_info < (3, 14))"],
        cwd: projectDirectory,
        timeout: 120000,
      });
      const version = /^(\d+)\.(\d+)\.(\d+)(?:(?:a|b|rc)\d+)?\+?$/.exec(runtime.stdout.trim());
      if (runtime.timedOut) {
        diagnostic = "timeout";
        failure = "The Hatch Python runtime check timed out. Python 3.14+ is required.";
      } else if (version && (Number(version[1]) < 3 || (Number(version[1]) === 3 && Number(version[2]) < 14))) {
        diagnostic = "unsupported-python";
        failure = "The Hatch Python runtime is unsupported. Python 3.14+ is required.";
      } else if (runtime.exitCode !== 0) {
        diagnostic = "runtime-unavailable";
        failure = "The Hatch Python runtime is unavailable. Install Hatch and configure Python 3.14+.";
      } else if (!version) {
        diagnostic = "invalid-report";
        failure = "The Hatch Python runtime returned an invalid version. Python 3.14+ is required.";
      }
    }
    if (failure) {
      typeStrictness.set(key, { metric: "type_strictness", tool: "pyrefly", value: -1, success: false, raw: failure, diagnostic });
      lintErrors.set(key, { metric: "lint_errors", tool: "ruff", value: -1, success: false, raw: failure, diagnostic });
      coverage.set(key, { metric: "test_coverage", tool: "pytest-cov", value: -1, success: false, raw: failure, diagnostic });
      continue;
    }

    // Type strictness
    onProgress?.("Type Strictness", "start");
    const typeResult = await measureTypeStrictness(detectedLang, projectDirectory);
    typeStrictness.set(key, typeResult);
    onProgress?.("Type Strictness", "done", typeResult);

    // Lint errors
    onProgress?.("Lint Errors", "start");
    const lintResult = await measureLintErrors(detectedLang, projectDirectory);
    lintErrors.set(key, lintResult);
    onProgress?.("Lint Errors", "done", lintResult);

    // Coverage
    onProgress?.("Test Coverage", "start");
    const coverageResult = await measureCoverage(detectedLang, projectDirectory);
    coverage.set(key, coverageResult);
    onProgress?.("Test Coverage", "done", coverageResult);
  }

  // Calculate summary totals
  let totalTypeErrors = 0;
  let totalLintErrors = 0;
  let coverageSum = 0;
  let coverageCount = 0;

  for (const result of typeStrictness.values()) {
    if (result.success && result.value >= 0) {
      totalTypeErrors += result.value;
    }
  }

  for (const result of lintErrors.values()) {
    if (result.success && result.value >= 0) {
      totalLintErrors += result.value;
    }
  }

  for (const result of coverage.values()) {
    if (result.success && result.value >= 0) {
      coverageSum += result.value;
      coverageCount++;
    }
  }

  const averageCoverage =
    coverageCount > 0 ? Math.round((coverageSum / coverageCount) * 10) / 10 : 0;

  return {
    languages,
    metrics: {
      typeStrictness,
      lintErrors,
      coverage,
    },
    summary: {
      totalTypeErrors,
      totalLintErrors,
      averageCoverage,
    },
  };
}
