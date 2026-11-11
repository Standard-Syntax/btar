import type { DetectedLanguage, SupportedLanguage } from "../types.js";
import type { MetricParser, MetricResult } from "./types.js";
import { runTool } from "./runner.js";

export interface TypeCheckerTool { tool: string; command: string[]; parseErrors: MetricParser; }

export function parsePyreflyErrors(stdout: string, _stderr: string, exitCode: number): number {
  if (exitCode !== 0 && exitCode !== 1) return -1;
  try {
    const parsed: unknown = JSON.parse(stdout);
    if (!parsed || typeof parsed !== "object" || !("errors" in parsed) || !Array.isArray(parsed.errors)) return -1;
    const errors = parsed.errors;
    if (errors.some((error) => !error || typeof error !== "object" || !("severity" in error) || typeof error.severity !== "string")) return -1;
    const count = errors.filter((error) => error.severity.toLowerCase() === "error").length;
    return exitCode !== 0 && count === 0 ? -1 : count;
  } catch { return -1; }
}

export const TYPE_CHECKER_TOOLS: Record<SupportedLanguage, TypeCheckerTool> = {
  python: { tool: "pyrefly", command: ["hatch", "run", "pyrefly", "check", "--output-format=json"], parseErrors: parsePyreflyErrors },
};

export async function measureTypeStrictness(_language: SupportedLanguage | DetectedLanguage, directory: string): Promise<MetricResult> {
  const tool = TYPE_CHECKER_TOOLS.python;
  const result = await runTool({ command: tool.command, cwd: directory, timeout: 120000 });
  if (result.exitCode === 127) return { metric: "type_strictness", tool: tool.tool, value: -1, success: false, raw: result.stderr || "pyrefly not found" };
  if (result.timedOut) return { metric: "type_strictness", tool: tool.tool, value: -1, success: false, raw: "Pyrefly timed out" };
  const value = tool.parseErrors(result.stdout, result.stderr, result.exitCode);
  return value < 0 ? { metric: "type_strictness", tool: tool.tool, value: -1, success: false, raw: result.stderr || result.stdout || "Invalid Pyrefly output" } : { metric: "type_strictness", tool: tool.tool, value, success: true, raw: result.exitCode === 0 ? undefined : result.stdout || result.stderr };
}
