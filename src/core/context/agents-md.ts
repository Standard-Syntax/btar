import { existsSync, readFileSync } from "node:fs";
import type { DetectedLanguage } from "../types.js";

export interface AgentsMdValidation { exists: boolean; issues: string[]; sections: string[]; }
export interface AgentsMdOptions { projectName: string; languages: DetectedLanguage[]; buildCommand?: string; testCommand?: string; lintCommand?: string; }

const REQUIRED_SECTIONS = [
  { label: "Build", pattern: /\b(build|building|setup|installation)\b/i },
  { label: "Testing", pattern: /\b(testing|tests)\b/i },
  { label: "Code Style", pattern: /\b(code style|conventions|formatting)\b/i },
];

export async function validateAgentsMd(filePath: string): Promise<AgentsMdValidation> {
  if (!existsSync(filePath)) return { exists: false, issues: ["File not found"], sections: [] };
  const content = readFileSync(filePath, "utf-8");
  if (content.trim() === "") return { exists: true, issues: ["Empty file"], sections: [] };
  const sections: string[] = [];
  let fence: { character: string; length: number } | undefined;
  for (const line of content.split(/\r?\n/)) {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line)) fence = undefined;
      continue;
    }
    if (!fence) {
      const heading = line.match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
      if (heading) sections.push(heading[1]);
    }
  }
  const issues = REQUIRED_SECTIONS.filter(({ pattern }) => !sections.some((section) => pattern.test(section))).map(({ label }) => `Missing recommended: ${label} commands`);
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
