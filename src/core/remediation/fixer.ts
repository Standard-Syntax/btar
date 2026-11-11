import type { SupportedLanguage } from "../types.js";
import { runTool } from "../metrics/runner.js";

export interface FixResult { success: boolean; filesModified: number; message: string; tool: string; }
interface FixTool { tool: string; command: string[]; parseOutput: (stdout: string, stderr: string, exitCode: number) => FixResult; }

export function parseRuffFixOutput(_stdout: string, stderr: string, exitCode: number): FixResult {
  const fixed = stderr.match(/Fixed (\d+) errors?/i);
  return exitCode === 0 ? { success: true, filesModified: -1, message: fixed ? `Ruff fixed ${fixed[1]} errors` : "Ruff fix completed", tool: "ruff" } : { success: false, filesModified: 0, message: "Ruff fix failed", tool: "ruff" };
}

export const FIX_TOOLS: Record<SupportedLanguage, FixTool> = {
  python: { tool: "ruff", command: ["hatch", "run", "ruff", "check", ".", "--fix"], parseOutput: parseRuffFixOutput },
};

export async function runFix(_language: SupportedLanguage, directory: string): Promise<FixResult> {
  const tool = FIX_TOOLS.python;
  const result = await runTool({ command: tool.command, cwd: directory, timeout: 120000 });
  if (result.exitCode === 127) return { success: false, filesModified: 0, message: "ruff not found", tool: tool.tool };
  if (result.timedOut) return { success: false, filesModified: 0, message: "Ruff timed out", tool: tool.tool };
  return tool.parseOutput(result.stdout, result.stderr, result.exitCode);
}
