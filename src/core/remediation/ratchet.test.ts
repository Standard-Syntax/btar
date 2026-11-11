/**
 * Ratchet Mode Tests
 *
 * TDD tests for score persistence and regression detection.
 * Ratchet mode prevents score regressions - once a score is achieved,
 * going backwards fails the build.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ScoreResult } from "../scoring.js";

// Import functions to test (will fail until implemented)
import {
  loadRatchetScore,
  saveRatchetScore,
  checkRatchetRegression,
  type RatchetState,
  type RatchetResult,
} from "./ratchet.js";

/**
 * Helper to create a ScoreResult for testing
 */
function createScoreResult(score: number): ScoreResult {
  return {
    score,
    breakdown: {
      typeStrictness: Math.round(score * 0.3),
      lintErrors: Math.round(score * 0.3),
      coverage: Math.round(score * 0.4),
    },
    interpretation: score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 50 ? "needs-work" : "poor",
  };
}

describe("Ratchet Mode", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), "btar-ratchet-test-"));
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("loadRatchetScore", () => {
    it("returns null when .btar-score file does not exist", async () => {
      expect(await loadRatchetScore(testDir)).toBeNull();
    });

    it("loads valid .btar-score file", async () => {
      const state: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
        score: 75,
        timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: {
          typeStrictness: 22,
          lintErrors: 23,
          coverage: 30,
        },
      };
      await writeFile(join(testDir, ".btar-score"), JSON.stringify(state, null, 2));

      const result = await loadRatchetScore(testDir);

      expect(result).not.toBeNull();
      expect(result!.score).toBe(75);
      expect(result!.timestamp).toBe("2026-01-15T10:00:00.000Z");
      expect(result!.breakdown.typeStrictness).toBe(22);
    });

    it("rejects invalid JSON in .btar-score", async () => {
      await writeFile(join(testDir, ".btar-score"), "not valid json {{{");

      await expect(loadRatchetScore(testDir)).rejects.toThrow(/malformed/);
    });

    it("rejects .btar-score with missing required fields", async () => {
      // Missing score field
      await writeFile(join(testDir, ".btar-score"), JSON.stringify({ timestamp: "2026-01-15" }));

      await expect(loadRatchetScore(testDir)).rejects.toThrow(/malformed/);
    });

    it("rejects .btar-score with invalid score type", async () => {
      await writeFile(
        join(testDir, ".btar-score"),
        JSON.stringify({
          score: "not a number",
          timestamp: "2026-01-15T10:00:00.000Z",
          breakdown: { typeStrictness: 0, lintErrors: 0, coverage: 0 },
        })
      );

      await expect(loadRatchetScore(testDir)).rejects.toThrow(/malformed/);
    });
  });

  describe("baseline compatibility", () => {
    it("rejects an unversioned legacy score with an actionable error", async () => {
      await writeFile(join(testDir, ".btar-score"), JSON.stringify({
        score: 75, timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: { typeStrictness: 22, lintErrors: 23, coverage: 30 },
      }));
      await expect(loadRatchetScore(testDir)).rejects.toThrow(/--save-baseline/);
    });

    it("binds a score to canonical project paths and rejects changed scopes", async () => {
      await saveRatchetScore(testDir, createScoreResult(75), ["packages/b", "packages/a", "packages/a/."]);
      const baseline = await loadRatchetScore(testDir, ["packages/a", "packages/b"]);
      expect(baseline?.projectPaths).toEqual(["packages/a", "packages/b"]);
      await expect(loadRatchetScore(testDir, ["packages/a"])).rejects.toThrow(/--save-baseline/);
    });

    it("rejects project paths outside the analysis root", async () => {
      await expect(saveRatchetScore(testDir, createScoreResult(75), ["../other"])).rejects.toThrow(/outside/);
    });

    it("rejects invalid scores, components and timestamps", async () => {
      await saveRatchetScore(testDir, createScoreResult(75));
      const path = join(testDir, ".btar-score");
      const valid = JSON.parse(await readFile(path, "utf-8"));
      for (const invalid of [
        { ...valid, score: 101 },
        { ...valid, score: -1 },
        { ...valid, timestamp: "2026-02-30T10:00:00.000Z" },
        { ...valid, breakdown: { ...valid.breakdown, typeStrictness: 31 } },
        { ...valid, breakdown: { ...valid.breakdown, lintErrors: -1 } },
        { ...valid, breakdown: { ...valid.breakdown, coverage: 41 } },
      ]) {
        await writeFile(path, JSON.stringify(invalid));
        await expect(loadRatchetScore(testDir)).rejects.toThrow(/malformed/);
      }
    });

    it("rejects a different scoring contract", async () => {
      await saveRatchetScore(testDir, createScoreResult(75));
      const path = join(testDir, ".btar-score");
      const state = JSON.parse(await readFile(path, "utf-8"));
      state.analysisScope = "multilingual";
      await writeFile(path, JSON.stringify(state));
      await expect(loadRatchetScore(testDir)).rejects.toThrow(/--save-baseline/);
    });
  });

  describe("saveRatchetScore", () => {
    it("saves score result to .btar-score file", async () => {
      const scoreResult = createScoreResult(80);

      await saveRatchetScore(testDir, scoreResult);

      const content = await readFile(join(testDir, ".btar-score"), "utf-8");
      const saved = JSON.parse(content) as RatchetState;

      expect(saved.score).toBe(80);
      expect(saved.breakdown).toEqual(scoreResult.breakdown);
      expect(saved.timestamp).toBeDefined();
    });

    it("overwrites existing .btar-score file", async () => {
      // Save initial score
      await saveRatchetScore(testDir, createScoreResult(70));

      // Save higher score
      await saveRatchetScore(testDir, createScoreResult(85));

      const content = await readFile(join(testDir, ".btar-score"), "utf-8");
      const saved = JSON.parse(content) as RatchetState;

      expect(saved.score).toBe(85);
    });

    it("saves with ISO timestamp", async () => {
      await saveRatchetScore(testDir, createScoreResult(75));

      const content = await readFile(join(testDir, ".btar-score"), "utf-8");
      const saved = JSON.parse(content) as RatchetState;

      // Verify ISO 8601 format
      expect(saved.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    });

    it("creates readable JSON with indentation", async () => {
      await saveRatchetScore(testDir, createScoreResult(75));

      const content = await readFile(join(testDir, ".btar-score"), "utf-8");

      // Should have newlines (formatted, not minified)
      expect(content).toContain("\n");
    });
  });

  describe("checkRatchetRegression", () => {
    const baseline: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
      score: 70,
      timestamp: "2026-01-15T10:00:00.000Z",
      breakdown: {
        typeStrictness: 21,
        lintErrors: 21,
        coverage: 28,
      },
    };

    it("passes when current score exceeds baseline", () => {
      const current = createScoreResult(75);

      const result = checkRatchetRegression(current, baseline);

      expect(result.passed).toBe(true);
      expect(result.delta).toBe(5);
      expect(result.message).toContain("improved");
    });

    it("passes when current score equals baseline", () => {
      const current = createScoreResult(70);

      const result = checkRatchetRegression(current, baseline);

      expect(result.passed).toBe(true);
      expect(result.delta).toBe(0);
      expect(result.message).toContain("maintained");
    });

    it("fails when current score is below baseline", () => {
      const current = createScoreResult(65);

      const result = checkRatchetRegression(current, baseline);

      expect(result.passed).toBe(false);
      expect(result.delta).toBe(-5);
      expect(result.message).toContain("regression");
      expect(result.message).toContain("65");
      expect(result.message).toContain("70");
    });

    it("includes delta in result", () => {
      const higherScore = checkRatchetRegression(createScoreResult(85), baseline);
      expect(higherScore.delta).toBe(15);

      const lowerScore = checkRatchetRegression(createScoreResult(50), baseline);
      expect(lowerScore.delta).toBe(-20);
    });

    it("provides meaningful message for regression", () => {
      const current = createScoreResult(65);
      const result = checkRatchetRegression(current, baseline);

      // Message should help user understand what happened
      expect(result.message.toLowerCase()).toContain("score");
      expect(result.message).toMatch(/65|70/); // Should mention both scores
    });
  });

  describe("RatchetResult structure", () => {
    it("contains passed, message, and delta", () => {
      const baseline: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
        score: 70,
        timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: { typeStrictness: 21, lintErrors: 21, coverage: 28 },
      };

      const result = checkRatchetRegression(createScoreResult(75), baseline);

      expect(result).toHaveProperty("passed");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("delta");
      expect(typeof result.passed).toBe("boolean");
      expect(typeof result.message).toBe("string");
      expect(typeof result.delta).toBe("number");
    });
  });

  describe("edge cases", () => {
    it("handles score of 0", () => {
      const baseline: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
        score: 10,
        timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: { typeStrictness: 3, lintErrors: 3, coverage: 4 },
      };

      const result = checkRatchetRegression(createScoreResult(0), baseline);

      expect(result.passed).toBe(false);
      expect(result.delta).toBe(-10);
    });

    it("handles score of 100", () => {
      const baseline: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
        score: 95,
        timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: { typeStrictness: 29, lintErrors: 29, coverage: 37 },
      };

      const result = checkRatchetRegression(createScoreResult(100), baseline);

      expect(result.passed).toBe(true);
      expect(result.delta).toBe(5);
    });

    it("handles baseline score of 0", () => {
      const baseline: RatchetState = {
        schemaVersion: 1, analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1", projectPaths: ["."],
        score: 0,
        timestamp: "2026-01-15T10:00:00.000Z",
        breakdown: { typeStrictness: 0, lintErrors: 0, coverage: 0 },
      };

      const result = checkRatchetRegression(createScoreResult(50), baseline);

      expect(result.passed).toBe(true);
      expect(result.delta).toBe(50);
    });
  });
});
