/**
 * Output Module
 * JSON serialization for analysis results
 */

import type { SupportedLanguage } from "./types.js";
import type { MetricResult } from "./metrics/types.js";
import type { MetricsReport } from "./metrics/index.js";
import type { ScoreResult, ScoreInterpretation } from "./scoring.js";
import type { Recommendation } from "./remediation/index.js";

/**
 * Language entry in JSON output
 */
export interface LanguageOutput {
  language: SupportedLanguage;
  confidence: "high" | "medium" | "low";
  markers: string[];
}

/**
 * Metric result entry in JSON output
 */
export interface MetricOutput {
  metric: string;
  tool: string;
  value: number;
  success: boolean;
  error?: string;
}

/**
 * Quality gate result
 */
export type GateResult = "passed" | "failed";

/**
 * Recommendation entry in JSON output
 */
export interface RecommendationOutput {
  /** Priority tier (P0 = highest) */
  tier: string;
  /** Category of the recommendation */
  category: string;
  /** Human-readable recommendation message */
  message: string;
  /** Impact level of implementing this recommendation */
  impact: string;
  /** Optional tool command suggestion */
  tool?: string;
}

/**
 * Options for JSON formatting
 */
export interface FormatJsonOptions {
  /** Quality gate threshold (if set, gateResult will be included) */
  failUnder?: number;
  ratchetFailure?: boolean;
  /** Recommendations to include in output */
  recommendations?: Recommendation[];
}

/**
 * JSON-serializable analysis output
 */
export interface AnalysisOutput {
  /** Languages detected in the project */
  languages: LanguageOutput[];
  /** Per-dimension metric results by language */
  metrics: {
    typeStrictness: Record<string, MetricOutput>;
    lintErrors: Record<string, MetricOutput>;
    coverage: Record<string, MetricOutput>;
  };
  /** Aggregated summary */
  summary: {
    totalTypeErrors: number;
    totalLintErrors: number;
    averageCoverage: number;
  };
  /** Agent-readiness score */
  score: number;
  /** Score interpretation */
  interpretation: ScoreInterpretation;
  /** Score breakdown by dimension */
  breakdown: {
    typeStrictness: number;
    lintErrors: number;
    coverage: number;
  };
  /** Quality gate result (only present if --fail-under was specified) */
  gateResult?: GateResult;
  /** Actionable recommendations (always present) */
  recommendations: RecommendationOutput[];
}

/**
 * Convert Map<SupportedLanguage, MetricResult> to Record<string, MetricOutput>
 */
function mapToRecord(
  map: Map<SupportedLanguage, MetricResult>
): Record<string, MetricOutput> {
  const record: Record<string, MetricOutput> = {};
  for (const [lang, result] of map) {
    record[lang] = {
      metric: result.metric,
      tool: result.tool,
      value: result.value,
      success: result.success,
      ...(!result.success && result.raw ? { error: result.raw.slice(0, 1000) } : {}),
    };
  }
  return record;
}

/**
 * Format MetricsReport as JSON string
 *
 * @param report - The metrics report to serialize
 * @param scoreResult - The calculated score result
 * @param options - Optional formatting options
 * @returns JSON string with 2-space indentation
 *
 * @example
 * ```ts
 * const report = await runAllMetrics({ directory: ".", languages });
 * const scoreResult = calculateScore(report);
 * const json = formatAsJson(report, scoreResult, { failUnder: 70 });
 * console.log(json); // Valid JSON output with gateResult
 * ```
 */
export function formatAsJson(
  report: MetricsReport,
  scoreResult: ScoreResult,
  options?: FormatJsonOptions
): string {
  // Map recommendations to output format
  const recommendationsOutput: RecommendationOutput[] = (
    options?.recommendations ?? []
  ).map((rec) => {
    const output: RecommendationOutput = {
      tier: rec.tier,
      category: rec.category,
      message: rec.message,
      impact: rec.impact,
    };
    if (rec.tool) {
      output.tool = rec.tool;
    }
    return output;
  });

  const output: AnalysisOutput = {
    languages: report.languages.map((l) => ({
      language: l.language,
      confidence: l.confidence,
      markers: l.markers,
    })),
    metrics: {
      typeStrictness: mapToRecord(report.metrics.typeStrictness),
      lintErrors: mapToRecord(report.metrics.lintErrors),
      coverage: mapToRecord(report.metrics.coverage),
    },
    summary: {
      totalTypeErrors: report.summary.totalTypeErrors,
      totalLintErrors: report.summary.totalLintErrors,
      averageCoverage: report.summary.averageCoverage,
    },
    score: scoreResult.score,
    interpretation: scoreResult.interpretation,
    breakdown: {
      typeStrictness: scoreResult.breakdown.typeStrictness,
      lintErrors: scoreResult.breakdown.lintErrors,
      coverage: scoreResult.breakdown.coverage,
    },
    recommendations: recommendationsOutput,
  };

  // Add gate result if threshold was specified
  if (options?.failUnder !== undefined || options?.ratchetFailure !== undefined) {
    const measurements = [...report.metrics.typeStrictness.values(), ...report.metrics.lintErrors.values(), ...report.metrics.coverage.values()];
    const complete = report.languages.length > 0 && measurements.length === report.languages.length * 3 && measurements.every((result) => result.success);
    output.gateResult = complete && !options.ratchetFailure && scoreResult.score >= (options.failUnder ?? 0) ? "passed" : "failed";
  }

  return JSON.stringify(output, null, 2);
}
