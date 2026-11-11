import type { ScoreResult } from "../scoring.js";
import type { MetricsReport } from "../metrics/index.js";

export type RecommendationTier = "P0" | "P1" | "P2" | "P3";
export type RecommendationCategory = "type-strictness" | "lint-errors" | "test-coverage" | "general";
export type RecommendationImpact = "high" | "medium" | "low";
export interface Recommendation { tier: RecommendationTier; category: RecommendationCategory; message: string; impact: RecommendationImpact; tool?: string; }

function availableCoverage(report: MetricsReport): boolean { return [...report.metrics.coverage.values()].some((result) => result.success && result.value >= 0); }

export function generateRecommendations(score: ScoreResult, report: MetricsReport): Recommendation[] {
  const recommendations: Recommendation[] = [];
  if (report.summary.totalTypeErrors > 0) recommendations.push({ tier: "P0", category: "type-strictness", message: `Fix ${report.summary.totalTypeErrors} Pyrefly type errors.`, impact: "high", tool: "hatch run pyrefly check" });
  if (report.summary.totalLintErrors > 0) recommendations.push({ tier: "P1", category: "lint-errors", message: `Fix ${report.summary.totalLintErrors} Ruff diagnostics.`, impact: "high", tool: "hatch run ruff check . --fix" });
  if (!availableCoverage(report)) recommendations.push({ tier: "P2", category: "test-coverage", message: "Configure pytest-cov and add Hypothesis property tests for boundary cases.", impact: "high", tool: "hatch run pytest --cov" });
  else if (report.summary.averageCoverage < 70) recommendations.push({ tier: "P2", category: "test-coverage", message: `Increase pytest coverage from ${report.summary.averageCoverage}% to at least 70%.`, impact: "medium" });
  if (score.interpretation === "excellent") recommendations.push({ tier: "P3", category: "general", message: "Keep Hatch environments and Python 3.14 tool versions current.", impact: "low" });
  return recommendations;
}
