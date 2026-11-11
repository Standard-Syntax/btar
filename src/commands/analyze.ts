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
import { formatAsJson } from "../core/output.js";
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

    if (languages.length === 0) {
      if (options.json) {
        console.log(
          JSON.stringify(
            { languages: [], metrics: {}, summary: {} },
            null,
            2
          )
        );
      } else {
        progress.info("No Python code detected");
      }
      process.exitCode = 1;
      return;
    }

    const languageNames = languages.map((l) => l.language).join(", ");
    progress.success(`Found: ${languageNames}`);

    // Run metrics (no progress callback in JSON mode)
    const report = await runAllMetrics({
      directory: resolvedDir,
      languages,
      onProgress: options.json
        ? undefined
        : (metric: string, status: string): void => {
            if (status === "start") {
              progress.info(`Measuring ${metric}...`);
            }
          },
    });

    // A missing measurement must not satisfy a CI gate.
    const failedMeasurements = [
      ...report.metrics.typeStrictness.values(),
      ...report.metrics.lintErrors.values(),
      ...report.metrics.coverage.values(),
    ].filter((measurement) => !measurement.success);

    // Calculate score
    const scoreResult = calculateScore(report);

    // Generate recommendations
    const recommendations = generateRecommendations(scoreResult, report);

    // Save baseline if requested
    if (options.saveBaseline && failedMeasurements.length === 0) {
      await saveRatchetScore(resolvedDir, scoreResult);
      progress.success(`Baseline score ${scoreResult.score} saved to .btar-score`);
    }

    // Ratchet check if requested
    let ratchetFailure = false;
    let ratchetMessage = "";
    if (options.ratchet) {
      const baseline = await loadRatchetScore(resolvedDir);
      if (!baseline) {
        ratchetFailure = true;
        ratchetMessage = "No baseline found. Run with --save-baseline first to enable ratchet mode.";
      } else {
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
      if (failedMeasurements.length > 0) {
        console.error(`BTAR verification incomplete: ${failedMeasurements.map((m) => m.tool).join(", ")}`);
        process.exitCode = 1;
        return;
      }
      if (gateFailure || ratchetFailure) {
        process.exitCode = 1;
      return;
      }
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
    if (failedMeasurements.length > 0) {
      progress.error(`BTAR verification incomplete: ${failedMeasurements.map((m) => m.tool).join(", ")}`);
      for (const result of failedMeasurements) {
        if (result.raw) progress.info(`${result.tool}: ${result.raw.slice(0, 1000)}`);
      }
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
