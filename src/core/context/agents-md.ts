import { existsSync, readFileSync } from "node:fs";
import type { DetectedLanguage } from "../types.js";

export interface AgentsMdValidation { exists: boolean; issues: string[]; sections: string[]; }
export interface AgentsMdOptions { projectName: string; languages: DetectedLanguage[]; buildCommand?: string; testCommand?: string; lintCommand?: string; }

const REQUIRED_SECTIONS = ["Build", "Testing", "Code Style"];

export async function validateAgentsMd(filePath: string): Promise<AgentsMdValidation> {
  if (!existsSync(filePath)) return { exists: false, issues: ["File not found"], sections: [] };
  const content = readFileSync(filePath, "utf-8");
  if (content.trim() === "") return { exists: true, issues: ["Empty file"], sections: [] };
  const sections = [...content.matchAll(/^#{1,3}\s+(.+)$/gm)].map((match) => match[1].trim());
  const issues = REQUIRED_SECTIONS.filter((section) => !sections.some((candidate) => candidate.toLowerCase().includes(section.toLowerCase()))).map((section) => `Missing recommended: ${section} commands`);
  return { exists: true, issues, sections };
}

export function generateAgentsMd(options: AgentsMdOptions): string {
  const build = options.buildCommand ?? "hatch env create";
  const test = options.testCommand ?? "hatch run pytest --cov --cov-report=term-missing";
  const lint = options.lintCommand ?? "hatch run ruff check . && hatch run ruff format --check .";
  return `# ${options.projectName}

This file provides context for AI coding agents.

## Language

- Python 3.14 or newer.

## Build

\`\`\`bash
${build}
\`\`\`

## Testing

\`\`\`bash
${test}
\`\`\`

Use Hypothesis for property-based tests when behavior has useful invariants.

## Code Style

\`\`\`bash
${lint}
\`\`\`

Run \`hatch run pyrefly check\` before handing off a change. Run \`gitleaks detect --no-banner\` from its installed binary and \`hatch run semgrep scan --config p/python --error --strict\` before handing off a change.
`;
}
