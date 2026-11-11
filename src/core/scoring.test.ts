/**
 * Scoring Engine Tests
 *
 * TDD tests for calculating Agent-Readiness Score from MetricsReport
 */

import { describe, it, expect } from "vitest";
import { calculateScore } from "./scoring.js";
import type { MetricsReport } from "./metrics/index.js";
import type { DetectedLanguage } from "./types.js";

/**
 * Helper to create a MetricsReport for testing
 */
function createReport(options: {
  typeErrors: number;
  lintErrors: number;
  coverage: number;
  hasCoverage?: boolean;
}): MetricsReport {
  const { typeErrors, lintErrors, coverage, hasCoverage = true } = options;

  const lang: DetectedLanguage = {
    language: "python",
    projectPath: ".",
    confidence: "high",
    markers: ["pyproject.toml"],
          buildSystem: "hatch",
  };

  return {
    languages: [lang],
    metrics: {
      typeStrictness: new Map([
        [
          "python",
          {
            metric: "type_strictness",
            tool: "pyrefly",
            value: typeErrors,
            success: true,
          },
        ],
      ]),
      lintErrors: new Map([
        [
          "python",
          {
            metric: "lint_errors",
            tool: "ruff",
            value: lintErrors,
            success: true,
          },
        ],
      ]),
      coverage: new Map([
        [
          "python",
          {
            metric: "test_coverage",
            tool: "pytest-cov",
            value: hasCoverage ? coverage : -1,
            success: hasCoverage,
          },
        ],
      ]),
    },
    summary: {
      totalTypeErrors: typeErrors,
      totalLintErrors: lintErrors,
      averageCoverage: hasCoverage ? coverage : 0,
    },
  };
}

describe("calculateScore", () => {
  describe("scoring formula", () => {
    it("returns 100 for perfect metrics (0 errors, 100% coverage)", () => {
      const report = createReport({
        typeErrors: 0,
        lintErrors: 0,
        coverage: 100,
      });

      const result = calculateScore(report);

      expect(result.score).toBe(100);
      expect(result.breakdown.typeStrictness).toBe(30);
      expect(result.breakdown.lintErrors).toBe(30);
      expect(result.breakdown.coverage).toBe(40);
    });

    it("returns ~84 for good metrics (0 type errors, 2 lint errors, 85% coverage)", () => {
      const report = createReport({
        typeErrors: 0,
        lintErrors: 2,
        coverage: 85,
      });

      const result = calculateScore(report);

      // 30 (type) + 20 (lint with 2 errors, log decay) + 34 (85% coverage) = 84
      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.score).toBeLessThanOrEqual(90);
      expect(result.breakdown.typeStrictness).toBe(30);
      expect(result.breakdown.lintErrors).toBeGreaterThan(15);
      expect(result.breakdown.lintErrors).toBeLessThan(30);
    });

    it("returns ~15-25 for poor metrics (50 type errors, 100 lint errors, 20% coverage)", () => {
      const report = createReport({
        typeErrors: 50,
        lintErrors: 100,
        coverage: 20,
      });

      const result = calculateScore(report);

      expect(result.score).toBeGreaterThanOrEqual(10);
      expect(result.score).toBeLessThanOrEqual(30);
    });

    it("returns 60 for no coverage data (0 type, 0 lint, n/a coverage)", () => {
      const report = createReport({
        typeErrors: 0,
        lintErrors: 0,
        coverage: 0,
        hasCoverage: false,
      });

      const result = calculateScore(report);

      // When no coverage data, type and lint become 50 points each
      expect(result.score).toBe(60);
      expect(result.breakdown.typeStrictness).toBe(30);
      expect(result.breakdown.lintErrors).toBe(30);
      expect(result.breakdown.coverage).toBe(0);
    });
  });

  describe("type strictness dimension", () => {
    it("gives 30 points for 0 errors", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 0 });
      const result = calculateScore(report);
      expect(result.breakdown.typeStrictness).toBe(30);
    });

    it("uses logarithmic decay for errors", () => {
      // 1 error should give less than 30 but still significant
      const report1 = createReport({ typeErrors: 1, lintErrors: 0, coverage: 0 });
      const result1 = calculateScore(report1);
      expect(result1.breakdown.typeStrictness).toBeGreaterThan(20);
      expect(result1.breakdown.typeStrictness).toBeLessThan(30);

      // 10 errors should give much less
      const report10 = createReport({ typeErrors: 10, lintErrors: 0, coverage: 0 });
      const result10 = calculateScore(report10);
      expect(result10.breakdown.typeStrictness).toBeLessThan(result1.breakdown.typeStrictness);
      expect(result10.breakdown.typeStrictness).toBeGreaterThan(10);

      // 100 errors should give even less
      const report100 = createReport({ typeErrors: 100, lintErrors: 0, coverage: 0 });
      const result100 = calculateScore(report100);
      expect(result100.breakdown.typeStrictness).toBeLessThan(result10.breakdown.typeStrictness);
    });
  });

  describe("lint errors dimension", () => {
    it("gives 30 points for 0 errors", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 0 });
      const result = calculateScore(report);
      expect(result.breakdown.lintErrors).toBe(30);
    });

    it("uses logarithmic decay for errors", () => {
      const report5 = createReport({ typeErrors: 0, lintErrors: 5, coverage: 0 });
      const result5 = calculateScore(report5);
      expect(result5.breakdown.lintErrors).toBeGreaterThan(15);
      expect(result5.breakdown.lintErrors).toBeLessThan(30);

      const report50 = createReport({ typeErrors: 0, lintErrors: 50, coverage: 0 });
      const result50 = calculateScore(report50);
      expect(result50.breakdown.lintErrors).toBeLessThan(result5.breakdown.lintErrors);
    });
  });

  describe("coverage dimension", () => {
    it("gives 40 points for 100% coverage", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 100 });
      const result = calculateScore(report);
      expect(result.breakdown.coverage).toBe(40);
    });

    it("gives 28 points for 70% coverage", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 70 });
      const result = calculateScore(report);
      expect(result.breakdown.coverage).toBe(28);
    });

    it("scales linearly with coverage percentage", () => {
      const report50 = createReport({ typeErrors: 0, lintErrors: 0, coverage: 50 });
      const result50 = calculateScore(report50);
      expect(result50.breakdown.coverage).toBe(20); // 50% * 40 = 20

      const report25 = createReport({ typeErrors: 0, lintErrors: 0, coverage: 25 });
      const result25 = calculateScore(report25);
      expect(result25.breakdown.coverage).toBe(10); // 25% * 40 = 10
    });

    it("gives 0 points for no coverage data", () => {
      const report = createReport({
        typeErrors: 0,
        lintErrors: 0,
        coverage: 0,
        hasCoverage: false,
      });
      const result = calculateScore(report);
      expect(result.breakdown.coverage).toBe(0);
    });
  });

  describe("interpretation", () => {
    it("returns 'excellent' for scores 90-100", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 100 });
      const result = calculateScore(report);
      expect(result.interpretation).toBe("excellent");
    });

    it("returns 'good' for scores 70-89", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 5, coverage: 75 });
      const result = calculateScore(report);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.score).toBeLessThan(90);
      expect(result.interpretation).toBe("good");
    });

    it("returns 'needs-work' for scores 50-69", () => {
      // Use fewer errors to land in the 50-69 range
      const report = createReport({ typeErrors: 5, lintErrors: 10, coverage: 50 });
      const result = calculateScore(report);
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThan(70);
      expect(result.interpretation).toBe("needs-work");
    });

    it("returns 'poor' for scores 0-49", () => {
      const report = createReport({ typeErrors: 100, lintErrors: 200, coverage: 10 });
      const result = calculateScore(report);
      expect(result.score).toBeLessThan(50);
      expect(result.interpretation).toBe("poor");
    });
  });

  describe("ScoreResult structure", () => {
    it("returns score, breakdown, and interpretation", () => {
      const report = createReport({ typeErrors: 0, lintErrors: 0, coverage: 80 });
      const result = calculateScore(report);

      expect(result).toHaveProperty("score");
      expect(result).toHaveProperty("breakdown");
      expect(result).toHaveProperty("interpretation");

      expect(typeof result.score).toBe("number");
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);

      expect(result.breakdown).toHaveProperty("typeStrictness");
      expect(result.breakdown).toHaveProperty("lintErrors");
      expect(result.breakdown).toHaveProperty("coverage");
    });
  });
});
