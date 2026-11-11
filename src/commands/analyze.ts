/**
 * Analyze Command
 * Analyzes a codebase for agent-readiness
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { detectLanguages } from "../core/detector.js";
import { createProgressReporter } from "../core/progress.js";
import { runAllMetrics } from "../core/metrics/index.js";
import { calculateScore } from "../core/scoring.js";
import { formatAsJson, safeMetricError } from "../core/output.js";
import {
  generateRecommendations,
  loadRatchetScore,
  saveRatchetScore,
  checkRatchetRegression,
} from "../core/remediation/index.js";
import type { MetricResult } from "../core/metrics/types.js";

/**
 * Options for analyze command
 */
export interface AnalyzeOptions {
  quiet?: boolean;
  trustProject?: boolean;
  config?: string;
  json?: boolean;
  failUnder?: number;
  ratchet?: boolean;
  saveBaseline?: boolean;
}

/**
 * Format metric value for display
 */
function formatMetricValue(result: MetricResult): string {
  if (!result.success) {
    return "n/a";
  }
  if (result.metric === "test_coverage") {
    return `${result.value}%`;
  }
  return `${result.value} errors`;
}

/**
 * Analyze a directory for agent-readiness
 * @param directory - Directory to analyze
 * @param options - Command options
 */
export async function analyzeCommand(
  directory: string,
  options: AnalyzeOptions = {}
): Promise<void> {
  if (options.ratchet && options.saveBaseline) {
    throw new Error("Use --ratchet and --save-baseline separately");
  }

  // JSON mode uses quiet progress (no text output)
  const progress = createProgressReporter({
    quiet: options.quiet || options.json,
  });
  try {
    const resolvedDir = resolve(directory);

    // Validate directory exists
    if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
      if (options.json) {
        console.error(`Directory not found: ${resolvedDir}`);
      } else {
        progress.error(`Directory not found: ${resolvedDir}`);
      }
      process.exitCode = 1;
      return;
    }

    progress.start(`Analyzing ${resolvedDir}...`);

    // Load config
    const config = await loadConfig(resolvedDir, options.config);

    // Detect languages
    const languages = await detectLanguages(resolvedDir, config);

    if (languages.length === 0) progress.info("No Python code detected");
    else progress.success(`Found: ${languages.map((l) => l.language).join(", ")}`);

    // Run metrics (no progress callback in JSON mode)
    const report = await runAllMetrics({
      directory: resolvedDir,
      languages,
      trustedProject: options.trustProject === true,
      onProgress: options.json
        ? undefined
        : (metric: string, status: string): void => {
            if (status === "start") {
              progress.info(`Measuring ${metric}...`);
            }
          },
    });

    // A missing measurement must not satisfy a CI gate.
    const measurements = [
      ...report.metrics.typeStrictness.values(),
      ...report.metrics.lintErrors.values(),
      ...report.metrics.coverage.values(),
    ];
    const failedMeasurements = measurements.filter((measurement) => !measurement.success);

    // Calculate score
    const scoreResult = calculateScore(report);

    // Generate recommendations
    const recommendations = languages.length === 0 ? [] : generateRecommendations(scoreResult, report);

    const projectPaths = languages.map((project) => project.projectPath);
    const complete = languages.length > 0 && measurements.length === languages.length * 3 && failedMeasurements.length === 0;
    if (options.saveBaseline && complete) {
      await saveRatchetScore(resolvedDir, scoreResult, projectPaths);
      progress.success(`Baseline score ${scoreResult.score} saved to .btar-score`);
    }

    // Ratchet check if requested
    let ratchetFailure = false;
    let ratchetMessage = "";
    if (options.ratchet) {
      let baseline;
      try {
        baseline = await loadRatchetScore(resolvedDir, projectPaths);
      } catch {
        ratchetFailure = true;
        ratchetMessage = "Ratchet baseline is incompatible or invalid. Review the current Python scope and deliberately run --save-baseline to replace it.";
      }
      if (!baseline && !ratchetFailure) {
        ratchetFailure = true;
        ratchetMessage = "No baseline found. Run with --save-baseline first to enable ratchet mode.";
      } else if (baseline && complete) {
        const ratchetResult = checkRatchetRegression(scoreResult, baseline);
        if (!ratchetResult.passed) {
          ratchetFailure = true;
          ratchetMessage = `Ratchet failed: Score ${scoreResult.score} is below baseline ${baseline.score} (${ratchetResult.delta})`;
        } else {
          progress.success(ratchetResult.message);
        }
      }
    }

    // Check quality gate
    const gateFailure =
      options.failUnder !== undefined && scoreResult.score < options.failUnder;

    // JSON output mode
    if (options.json) {
      console.log(
        formatAsJson(report, scoreResult, {
          failUnder: options.failUnder,
          recommendations,
          ratchetFailure: options.ratchet ? ratchetFailure : undefined,
        })
      );
      if (!complete) {
        console.error(languages.length === 0 ? "BTAR verification incomplete: no Python code detected." : options.trustProject === true ? "BTAR verification incomplete." : "Project execution requires --trust-project. Hatch configuration and tests can execute code with your privileges.");
        if (ratchetFailure) console.error(ratchetMessage);
        process.exitCode = 1;
        return;
      }
      if (gateFailure || ratchetFailure) {
        if (ratchetFailure) console.error(ratchetMessage);
        process.exitCode = 1;
        return;
      }
      return;
    }

    if (languages.length === 0) {
      progress.error("BTAR verification incomplete: no Python code detected");
      if (ratchetFailure) progress.error(ratchetMessage);
      process.exitCode = 1;
      return;
    }

    // Text output mode
    progress.section("Metrics:");

    // Type Strictness
    progress.section("Type Strictness");
    for (const [lang, result] of report.metrics.typeStrictness) {
      progress.metric(
        lang,
        result.tool,
        formatMetricValue(result),
        result.success
      );
    }

    // Lint Errors
    progress.section("Lint Errors");
    for (const [lang, result] of report.metrics.lintErrors) {
      progress.metric(
        lang,
        result.tool,
        formatMetricValue(result),
        result.success
      );
    }

    // Test Coverage
    progress.section("Test Coverage");
    for (const [lang, result] of report.metrics.coverage) {
      progress.metric(
        lang,
        result.tool,
        formatMetricValue(result),
        result.success
      );
    }

    // Summary
    progress.section("Summary:");
    progress.summary("Type errors", report.summary.totalTypeErrors);
    progress.summary("Lint errors", report.summary.totalLintErrors);
    progress.summary("Coverage", `${report.summary.averageCoverage}%`);
    progress.summary(
      "Score",
      `${scoreResult.score}/100 (${scoreResult.interpretation})`
    );

    // Recommendations
    if (recommendations.length > 0) {
      progress.section("Recommendations:");
      for (const rec of recommendations) {
        const toolHint = rec.tool ? ` (run: ${rec.tool})` : "";
        progress.info(`  ${rec.tier}: ${rec.message}${toolHint}`);
      }
    }

    // Quality gate enforcement
    if (!complete) {
      const reason = failedMeasurements.map((m) => m.tool).join(", ") || "measurements missing";
      progress.error(`BTAR verification incomplete: ${reason}`);
      for (const result of failedMeasurements) {
        progress.info(`${result.tool}: ${safeMetricError(result)}`);
      }
      if (ratchetFailure) progress.error(ratchetMessage);
      process.exitCode = 1;
      return;
    }

    if (gateFailure) {
      progress.error(
        `Score ${scoreResult.score} is below threshold ${options.failUnder}`
      );
      process.exitCode = 1;
      return;
    }

    // Ratchet failure
    if (ratchetFailure) {
      progress.error(ratchetMessage);
      progress.info("Run with --save-baseline to update baseline after fixing issues.");
      process.exitCode = 1;
      return;
    }
  } finally {
    await progress.finish();
  }
}
