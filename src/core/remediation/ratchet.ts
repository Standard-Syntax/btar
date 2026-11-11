/**
 * Ratchet Mode - Score Persistence and Regression Detection
 *
 * Enables CI enforcement of "never go backwards" - once a score is achieved,
 * regressions fail the build. This prevents gradual quality degradation.
 *
 * The ratchet score is persisted to `.btar-score` in the project root.
 */

import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import type { ScoreResult } from "../scoring.js";

/**
 * Name of the ratchet score file
 */
const RATCHET_FILE = ".btar-score";

/**
 * Persisted ratchet state
 */
export interface RatchetState {
  schemaVersion: 1;
  analysisScope: "python-3.14-pyrefly-ruff-pytest-cov-v1";
  projectPaths: string[];
  /** Baseline score that must be maintained or exceeded */
  score: number;
  /** ISO timestamp when this baseline was saved */
  timestamp: string;
  /** Per-dimension breakdown for debugging regressions */
  breakdown: ScoreResult["breakdown"];
}

/**
 * Result of checking for score regression
 */
export interface RatchetResult {
  /** Whether the current score passes the ratchet check */
  passed: boolean;
  /** Human-readable message explaining the result */
  message: string;
  /** Score difference (positive = improvement, negative = regression) */
  delta: number;
}

const ANALYSIS_SCOPE = "python-3.14-pyrefly-ruff-pytest-cov-v1";
const MALFORMED = "Baseline file is malformed. Run --save-baseline deliberately to replace it.";
const INCOMPATIBLE = "Baseline is incompatible with this analysis. Run --save-baseline deliberately to replace it.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function inRange(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= max;
}

function canonicalProjects(directory: string, projectPaths: string[]): string[] {
  const root = resolve(directory);
  const paths = projectPaths.map((path) => {
    const project = relative(root, resolve(root, path));
    if (project === ".." || project.startsWith(`..${sep}`) || isAbsolute(project)) {
      throw new Error("Project path is outside the analysis directory.");
    }
    return project.split(sep).join("/") || ".";
  });
  if (paths.length === 0) throw new Error("At least one project path is required.");
  return [...new Set(paths)].sort();
}

function parseScore(value: unknown): Pick<RatchetState, "score" | "timestamp" | "breakdown"> | null {
  if (!isRecord(value) || !isRecord(value.breakdown)) return null;
  const { score, timestamp, breakdown } = value;
  if (!inRange(score, 100) || typeof timestamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp ||
      !inRange(breakdown.typeStrictness, 30) || !inRange(breakdown.lintErrors, 30) ||
      !inRange(breakdown.coverage, 40)) return null;
  return {
    score, timestamp,
    breakdown: {
      typeStrictness: breakdown.typeStrictness,
      lintErrors: breakdown.lintErrors,
      coverage: breakdown.coverage,
    },
  };
}

/** Load a compatible baseline, or null when it is missing. */
export async function loadRatchetScore(directory: string, projectPaths: string[] = ["."]): Promise<RatchetState | null> {
  let content: string;
  try {
    content = await readFile(join(directory, RATCHET_FILE), "utf-8");
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return null;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(MALFORMED);
  }
  const score = parseScore(parsed);
  if (!score || !isRecord(parsed)) throw new Error(MALFORMED);
  if (parsed.schemaVersion !== 1 || parsed.analysisScope !== ANALYSIS_SCOPE) {
    throw new Error(INCOMPATIBLE);
  }
  if (!Array.isArray(parsed.projectPaths) || !parsed.projectPaths.every((path: unknown) => typeof path === "string")) throw new Error(MALFORMED);
  const expected = canonicalProjects(directory, projectPaths);
  const stored = parsed.projectPaths;
  if (JSON.stringify(stored) !== JSON.stringify(expected)) throw new Error(INCOMPATIBLE);
  return { schemaVersion: 1, analysisScope: ANALYSIS_SCOPE, projectPaths: expected, ...score };
}

/** Save the score and its analysis scope as a new baseline. */
export async function saveRatchetScore(directory: string, scoreResult: ScoreResult, projectPaths: string[] = ["."]): Promise<void> {
  const state: RatchetState = {
    schemaVersion: 1,
    analysisScope: ANALYSIS_SCOPE,
    projectPaths: canonicalProjects(directory, projectPaths),
    score: scoreResult.score,
    timestamp: new Date().toISOString(),
    breakdown: scoreResult.breakdown,
  };
  if (!parseScore(state)) throw new Error("Cannot save an invalid baseline score.");
  await writeFile(join(directory, RATCHET_FILE), JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Check if current score represents a regression from baseline
 *
 * @param current - Current score result
 * @param baseline - Previously saved ratchet state
 * @returns RatchetResult indicating pass/fail and delta
 *
 * @example
 * ```ts
 * const baseline = await loadRatchetScore(directory);
 * if (baseline) {
 *   const result = checkRatchetRegression(currentScore, baseline);
 *   if (!result.passed) {
 *     console.error(result.message);
 *     process.exit(1);
 *   }
 * }
 * ```
 */
export function checkRatchetRegression(current: ScoreResult, baseline: RatchetState): RatchetResult {
  const delta = current.score - baseline.score;

  if (delta > 0) {
    return {
      passed: true,
      delta,
      message: `Score improved: ${current.score} (was ${baseline.score}, +${delta})`,
    };
  }

  if (delta === 0) {
    return {
      passed: true,
      delta: 0,
      message: `Score maintained at ${current.score}`,
    };
  }

  // Regression detected
  return {
    passed: false,
    delta,
    message: `Score regression: ${current.score} < ${baseline.score} (${delta} points)`,
  };
}
