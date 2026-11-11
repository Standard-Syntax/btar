import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricParser, MetricResult } from "./types.js";
import { runTool } from "./runner.js";

export interface CoverageTool { tool: string; command: string[]; parseCoverage: MetricParser; }

export function parsePytestCoverageJson(stdout: string, _stderr: string, exitCode: number): number {
  if (exitCode !== 0) return -1;
  try {
    const report: unknown = JSON.parse(stdout);
    if (!report || typeof report !== "object" || !("totals" in report) || !report.totals || typeof report.totals !== "object" || !("percent_covered" in report.totals)) return -1;
    const value = report.totals.percent_covered;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : -1;
  } catch { return -1; }
}

export const COVERAGE_TOOLS: Record<SupportedLanguage, CoverageTool> = {
  python: { tool: "pytest-cov", command: ["hatch", "run", "pytest", "--cov", "--cov-report=json:coverage.json", "-q"], parseCoverage: parsePytestCoverageJson },
};

export async function measureCoverage(_language: SupportedLanguage | DetectedLanguage, directory: string): Promise<MetricResult> {
  const tool = COVERAGE_TOOLS.python;
  let temporaryDirectory: string | undefined;
  const failure = (raw: string): MetricResult => ({ metric: "test_coverage", tool: tool.tool, value: -1, success: false, raw });
  try {
    temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "btar-pytest-cov-"));
    const output = path.join(temporaryDirectory, "coverage.json");
    const result = await runTool({ command: ["hatch", "run", "pytest", "--cov", `--cov-report=json:${output}`, "-q"], cwd: directory, timeout: 120000 });
    if (result.timedOut) return failure("pytest-cov timed out");
    if (result.exitCode !== 0) return failure(result.stderr || result.stdout || "pytest or pytest-cov failed");
    let report: string;
    try { report = await fs.readFile(output, "utf8"); } catch { return failure("pytest-cov did not create its coverage report"); }
    const value = tool.parseCoverage(report, "", 0);
    return value < 0 ? failure("Invalid pytest-cov coverage report") : { metric: "test_coverage", tool: tool.tool, value, success: true, raw: result.stdout.slice(0, 1000) };
  } catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
  finally { if (temporaryDirectory) await fs.rm(temporaryDirectory, { recursive: true, force: true }); }
}
