/**
 * Tier-Based Recommendations Engine
 *
 * Generates actionable, prioritized recommendations based on Agent-Readiness Score
 */

import type { ScoreResult, ScoreInterpretation } from "../scoring.js";
import type { MetricsReport } from "../metrics/index.js";
import type { DetectedLanguage, SupportedLanguage } from "../types.js";

/**
 * Priority tier for recommendations
 */
export type RecommendationTier = "P0" | "P1" | "P2" | "P3";

/**
 * Category of recommendation
 */
export type RecommendationCategory =
  | "type-strictness"
  | "lint-errors"
  | "test-coverage"
  | "general";

/**
 * Impact level of implementing the recommendation
 */
export type RecommendationImpact = "high" | "medium" | "low";

/**
 * A single actionable recommendation
 */
export interface Recommendation {
  /** Priority tier (P0 = highest) */
  tier: RecommendationTier;
  /** Category of the recommendation */
  category: RecommendationCategory;
  /** Human-readable recommendation message */
  message: string;
  /** Impact level of implementing this recommendation */
  impact: RecommendationImpact;
  /** Optional tool command suggestion */
  tool?: string;
}

/**
 * Tool suggestions by language for auto-fixing lint errors
 */
const LINT_FIX_TOOLS: Record<SupportedLanguage, string> = {
  typescript: "npx eslint --fix .",
  javascript: "npx eslint --fix .",
  python: "uv run --python 3.14 ruff check --fix .",
  go: "golangci-lint run --fix",
  java: "checkstyle",
  swift: "swiftlint lint --fix",
  kotlin: "ktlint --format",
  ruby: "rubocop --auto-correct",
  php: "phpcbf .",
};

/**
 * Get lint fix tool, considering build system
 */
function getLintFixTool(report: MetricsReport): string {
  const lang = getPrimaryLanguage(report);
  const primaryDetected = report.languages[0];

  // For Gradle Java/Kotlin projects, use Gradle lint
  if (primaryDetected?.buildSystem === "gradle" && (lang === "java" || lang === "kotlin")) {
    return "./gradlew lint";
  }

  return LINT_FIX_TOOLS[lang];
}

/**
 * Check if coverage data is available in the report
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
 * Get the primary language from the report
 */
function getPrimaryLanguage(report: MetricsReport): SupportedLanguage {
  return report.languages[0]?.language ?? "typescript";
}

/**
 * Generate recommendations for excellent tier (90+)
 */
function generateExcellentRecommendations(
  report: MetricsReport
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { totalTypeErrors, totalLintErrors, averageCoverage } = report.summary;

  // Always add a maintenance message
  recommendations.push({
    tier: "P3",
    category: "general",
    message:
      "Excellent! Your codebase is well-maintained. Consider these optional improvements.",
    impact: "low",
  });

  // Suggest advanced practices
  recommendations.push({
    tier: "P3",
    category: "test-coverage",
    message:
      "Consider property-based testing or mutation testing for even higher confidence.",
    impact: "low",
  });

  // If there are still a few errors, suggest fixing them
  if (totalTypeErrors > 0) {
    recommendations.push({
      tier: "P2",
      category: "type-strictness",
      message: `Fix ${totalTypeErrors} remaining type error${totalTypeErrors === 1 ? "" : "s"} to reach perfection.`,
      impact: "low",
    });
  }

  if (totalLintErrors > 0) {
    recommendations.push({
      tier: "P2",
      category: "lint-errors",
      message: `Fix ${totalLintErrors} remaining lint error${totalLintErrors === 1 ? "" : "s"} for a cleaner codebase.`,
      impact: "low",
      tool: getLintFixTool(report),
    });
  }

  if (averageCoverage < 95) {
    recommendations.push({
      tier: "P3",
      category: "test-coverage",
      message: `Increase test coverage from ${averageCoverage}% to 95%+ for maximum confidence.`,
      impact: "low",
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for good tier (70-89)
 */
function generateGoodRecommendations(report: MetricsReport): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { totalTypeErrors, totalLintErrors, averageCoverage } = report.summary;

  // Type errors are higher priority
  if (totalTypeErrors > 0) {
    recommendations.push({
      tier: "P1",
      category: "type-strictness",
      message: `Fix ${totalTypeErrors} type error${totalTypeErrors === 1 ? "" : "s"} to improve code reliability.`,
      impact: "medium",
    });
  }

  // Lint errors
  if (totalLintErrors > 0) {
    recommendations.push({
      tier: "P1",
      category: "lint-errors",
      message: `Fix ${totalLintErrors} lint error${totalLintErrors === 1 ? "" : "s"} to improve code quality.`,
      impact: "medium",
      tool: getLintFixTool(report),
    });
  }

  // Coverage improvements
  if (averageCoverage < 80) {
    recommendations.push({
      tier: "P2",
      category: "test-coverage",
      message: `Improve test coverage from ${averageCoverage}% to 80%+ for better confidence.`,
      impact: "medium",
    });
  } else if (averageCoverage < 90) {
    recommendations.push({
      tier: "P3",
      category: "test-coverage",
      message: `Consider improving test coverage from ${averageCoverage}% to 90%+.`,
      impact: "low",
    });
  }

  // If no specific issues, add general improvement
  if (recommendations.length === 0) {
    recommendations.push({
      tier: "P2",
      category: "general",
      message: "Good progress! Focus on reducing any remaining errors to reach excellent tier.",
      impact: "medium",
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for needs-work tier (50-69)
 */
function generateNeedsWorkRecommendations(
  report: MetricsReport
): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { totalTypeErrors, totalLintErrors, averageCoverage } = report.summary;
  const hasCoverage = hasCoverageData(report);

  // P0: Type errors are highest priority
  if (totalTypeErrors > 0) {
    recommendations.push({
      tier: "P0",
      category: "type-strictness",
      message: `Fix ${totalTypeErrors} type error${totalTypeErrors === 1 ? "" : "s"}. Type safety is critical for AI agent reliability.`,
      impact: "high",
    });
  }

  // P1: Lint errors
  if (totalLintErrors > 0) {
    recommendations.push({
      tier: "P1",
      category: "lint-errors",
      message: `Fix ${totalLintErrors} lint error${totalLintErrors === 1 ? "" : "s"}. Clean code is easier for AI agents to modify.`,
      impact: "high",
      tool: getLintFixTool(report),
    });
  }

  // P2: Coverage
  if (!hasCoverage) {
    recommendations.push({
      tier: "P2",
      category: "test-coverage",
      message: "Set up test coverage measurement. Tests verify AI-generated code works correctly.",
      impact: "high",
    });
  } else if (averageCoverage < 50) {
    recommendations.push({
      tier: "P2",
      category: "test-coverage",
      message: `Increase test coverage from ${averageCoverage}% to 50%+. More tests catch AI errors.`,
      impact: "high",
    });
  } else {
    recommendations.push({
      tier: "P2",
      category: "test-coverage",
      message: `Improve test coverage from ${averageCoverage}% to 70%+ for better verification.`,
      impact: "medium",
    });
  }

  return recommendations;
}

/**
 * Generate recommendations for poor tier (<50)
 */
function generatePoorRecommendations(report: MetricsReport): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { totalTypeErrors, totalLintErrors } = report.summary;
  const hasCoverage = hasCoverageData(report);

  // Foundation first - P0 for type errors
  if (totalTypeErrors > 0) {
    if (totalTypeErrors > 50) {
      recommendations.push({
        tier: "P0",
        category: "type-strictness",
        message: `Add strict type checking configuration. ${totalTypeErrors} type errors indicate weak type safety.`,
        impact: "high",
      });
    } else {
      recommendations.push({
        tier: "P0",
        category: "type-strictness",
        message: `Fix ${totalTypeErrors} type error${totalTypeErrors === 1 ? "" : "s"} to establish type safety foundation.`,
        impact: "high",
      });
    }
  }

  // P1 for lint errors
  if (totalLintErrors > 0) {
    if (totalLintErrors > 50) {
      recommendations.push({
        tier: "P1",
        category: "lint-errors",
        message: `Set up linter with auto-fix enabled. ${totalLintErrors} lint errors need attention.`,
        impact: "high",
        tool: getLintFixTool(report),
      });
    } else {
      recommendations.push({
        tier: "P1",
        category: "lint-errors",
        message: `Fix ${totalLintErrors} lint error${totalLintErrors === 1 ? "" : "s"} to improve code quality.`,
        impact: "high",
        tool: getLintFixTool(report),
      });
    }
  }

  // P3 for coverage - deferred until basics are fixed
  if (!hasCoverage) {
    recommendations.push({
      tier: "P3",
      category: "test-coverage",
      message: "Add test coverage after fixing type and lint errors. Focus on foundation first.",
      impact: "low",
    });
  } else {
    recommendations.push({
      tier: "P3",
      category: "test-coverage",
      message: "Improve test coverage after addressing type and lint errors.",
      impact: "low",
    });
  }

  return recommendations;
}

/**
 * Sort recommendations by tier then by impact
 */
function sortRecommendations(recommendations: Recommendation[]): Recommendation[] {
  const tierOrder: Record<RecommendationTier, number> = {
    P0: 0,
    P1: 1,
    P2: 2,
    P3: 3,
  };

  const impactOrder: Record<RecommendationImpact, number> = {
    high: 0,
    medium: 1,
    low: 2,
  };

  return [...recommendations].sort((a, b) => {
    const tierDiff = tierOrder[a.tier] - tierOrder[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return impactOrder[a.impact] - impactOrder[b.impact];
  });
}

/**
 * Generate tier-based recommendations from score and metrics
 *
 * @param scoreResult - The calculated score result
 * @param report - The metrics report with detailed measurements
 * @returns Array of recommendations ordered by priority
 *
 * @example
 * ```ts
 * const recommendations = generateRecommendations(scoreResult, report);
 * for (const rec of recommendations) {
 *   console.log(`[${rec.tier}] ${rec.message}`);
 *   if (rec.tool) console.log(`  Run: ${rec.tool}`);
 * }
 * ```
 */
export function generateRecommendations(
  scoreResult: ScoreResult,
  report: MetricsReport
): Recommendation[] {
  const { interpretation } = scoreResult;

  // Generate recommendations based on tier
  const generators: Record<ScoreInterpretation, (r: MetricsReport) => Recommendation[]> = {
    excellent: generateExcellentRecommendations,
    good: generateGoodRecommendations,
    "needs-work": generateNeedsWorkRecommendations,
    poor: generatePoorRecommendations,
  };

  const recommendations = generators[interpretation](report);

  // Sort by tier then impact and return
  return sortRecommendations(recommendations);
}
