/**
 * Scoring Engine
 *
 * Converts MetricsReport into Agent-Readiness Score (0-100)
 *
 * Scoring formula (Foundation Tier from PROJECT.md):
 * - Type strictness: 0 errors = 30 points, logarithmic decay with errors
 * - Lint errors: 0 errors = 30 points, logarithmic decay with errors
 * - Test coverage: 70%+ = up to 40 points, linear scaling
 */

import type { MetricsReport } from "./metrics/index.js";

/**
 * Interpretation of score quality
 */
export type ScoreInterpretation = "excellent" | "good" | "needs-work" | "poor";

/**
 * Result of calculating agent-readiness score
 */
export interface ScoreResult {
  /** Composite score 0-100 */
  score: number;
  /** Per-dimension point breakdown */
  breakdown: {
    /** Points from type strictness (max 30) */
    typeStrictness: number;
    /** Points from lint errors (max 30) */
    lintErrors: number;
    /** Points from test coverage (max 40) */
    coverage: number;
  };
  /** Human-readable interpretation */
  interpretation: ScoreInterpretation;
}

/**
 * Maximum points per dimension
 */
const MAX_POINTS = {
  typeStrictness: 30,
  lintErrors: 30,
  coverage: 40,
} as const;

/**
 * Calculate points from error count using logarithmic decay
 *
 * Formula: maxPoints * (1 / (1 + log10(1 + errors)))
 *
 * This gives:
 * - 0 errors → maxPoints (full score)
 * - 1 error → ~75% of max
 * - 10 errors → ~50% of max
 * - 100 errors → ~33% of max
 *
 * @param errors - Number of errors
 * @param maxPoints - Maximum points for this dimension
 * @returns Points earned (0 to maxPoints)
 */
function calculateErrorPoints(errors: number, maxPoints: number): number {
  if (errors <= 0) {
    return maxPoints;
  }

  // Logarithmic decay: score decreases slowly as errors increase
  const decayFactor = 1 / (1 + Math.log10(1 + errors));
  return Math.round(maxPoints * decayFactor);
}

/**
 * Calculate points from coverage percentage
 *
 * Linear scaling: (coverage / 100) * maxPoints
 *
 * @param coverage - Coverage percentage (0-100)
 * @param maxPoints - Maximum points for this dimension
 * @returns Points earned (0 to maxPoints)
 */
function calculateCoveragePoints(coverage: number, maxPoints: number): number {
  if (coverage < 0) {
    return 0;
  }

  // Linear scaling, capped at max
  const points = (coverage / 100) * maxPoints;
  return Math.round(Math.min(points, maxPoints));
}

/**
 * Determine interpretation based on score
 *
 * @param score - Composite score (0-100)
 * @returns Human-readable interpretation
 */
function getInterpretation(score: number): ScoreInterpretation {
  if (score >= 90) {
    return "excellent";
  }
  if (score >= 70) {
    return "good";
  }
  if (score >= 50) {
    return "needs-work";
  }
  return "poor";
}

/**
 * Check if coverage data is available
 *
 * @param report - Metrics report to check
 * @returns true if any language has valid coverage data
 */
function hasCoverageData(report: MetricsReport): boolean {
  for (const result of report.metrics.coverage.values()) {
    if (result.success && result.value >= 0) {
      return true;
    }
  }
  return false;
}

/**
 * Calculate Agent-Readiness Score from MetricsReport
 *
 * @param report - Complete metrics report from runAllMetrics
 * @returns Score result with breakdown and interpretation
 *
 * @example
 * ```ts
 * const report = await runAllMetrics({ directory: ".", languages });
 * const result = calculateScore(report);
 *
 * console.log(`Score: ${result.score}/100 (${result.interpretation})`);
 * console.log(`Type: ${result.breakdown.typeStrictness}/30`);
 * console.log(`Lint: ${result.breakdown.lintErrors}/30`);
 * console.log(`Coverage: ${result.breakdown.coverage}/40`);
 * ```
 */
export function calculateScore(report: MetricsReport): ScoreResult {
  if (report.languages.length === 0) {
    return { score: 0, breakdown: { typeStrictness: 0, lintErrors: 0, coverage: 0 }, interpretation: "poor" };
  }
  const { summary } = report;

  // Calculate dimension points
  const typeStrictnessPoints = calculateErrorPoints(
    summary.totalTypeErrors,
    MAX_POINTS.typeStrictness
  );

  const lintErrorsPoints = calculateErrorPoints(
    summary.totalLintErrors,
    MAX_POINTS.lintErrors
  );

  // Coverage points: 0 if no coverage data available
  const coveragePoints = hasCoverageData(report)
    ? calculateCoveragePoints(summary.averageCoverage, MAX_POINTS.coverage)
    : 0;

  // Composite score
  const score = typeStrictnessPoints + lintErrorsPoints + coveragePoints;

  return {
    score,
    breakdown: {
      typeStrictness: typeStrictnessPoints,
      lintErrors: lintErrorsPoints,
      coverage: coveragePoints,
    },
    interpretation: getInterpretation(score),
  };
}
