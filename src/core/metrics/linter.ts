import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricParser, MetricResult } from "./types.js";
import { runTool } from "./runner.js";

interface LinterTool { tool: string; command: string[]; parseErrors: MetricParser; }

export function parseRuffJson(stdout: string, _stderr: string, exitCode: number): number {
  if (exitCode !== 0 && exitCode !== 1) return -1;
  try {
    const diagnostics: unknown = JSON.parse(stdout);
    if (!Array.isArray(diagnostics) || diagnostics.some((item: unknown) =>
      !item || typeof item !== "object" || !("code" in item) || typeof item.code !== "string")) return -1;
    return exitCode === 1 && diagnostics.length === 0 ? -1 : diagnostics.length;
  } catch { return -1; }
}

export const LINTER_TOOLS: Record<SupportedLanguage, LinterTool> = {
  python: { tool: "ruff", command: ["hatch", "run", "ruff", "check", ".", "--output-format=json"], parseErrors: parseRuffJson },
};

export async function measureLintErrors(_language: SupportedLanguage | DetectedLanguage, directory: string): Promise<MetricResult> {
  const tool = LINTER_TOOLS.python;
  const result = await runTool({ command: tool.command, cwd: directory, timeout: 120000 });
  if (result.exitCode === 127) return { metric: "lint_errors", tool: tool.tool, value: -1, success: false, raw: result.stderr || "ruff not found" };
  if (result.timedOut) return { metric: "lint_errors", tool: tool.tool, value: -1, success: false, raw: "Ruff timed out" };
  const value = tool.parseErrors(result.stdout, result.stderr, result.exitCode);
  return value < 0 ? { metric: "lint_errors", tool: tool.tool, value: -1, success: false, raw: result.stderr || result.stdout || "Invalid Ruff output" } : { metric: "lint_errors", tool: tool.tool, value, success: true, raw: result.exitCode === 0 ? undefined : result.stdout || result.stderr };
}
