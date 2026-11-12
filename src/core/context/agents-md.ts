import { readFileSync } from "node:fs";
import { posix } from "node:path";
import type { DetectedLanguage } from "../types.js";
import { managedBlock, type RepositoryAgentContext } from "./repository-context.js";

export interface AgentsMdValidation { exists: boolean; issues: string[]; sections: string[]; }
export interface AgentsMdOptions { projectName: string; languages: DetectedLanguage[]; buildCommand?: string; testCommand?: string; lintCommand?: string; context?: RepositoryAgentContext; repositoryRoot?: string; }

const REQUIRED_SECTIONS = [
  { label: "Build", pattern: /\b(build|building|setup|installation)\b/i },
  { label: "Testing", pattern: /\b(testing|tests)\b/i },
  { label: "Code Style", pattern: /\b(code style|conventions|formatting)\b/i },
];

export async function validateAgentsMd(filePath: string): Promise<AgentsMdValidation> {
  let content: string;
  try { content = readFileSync(filePath, "utf-8"); }
  catch { return { exists: false, issues: ["File not found"], sections: [] }; }
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
  const context = options.context;
  const repositoryRoot = options.repositoryRoot ?? ".";
  const projects = context?.projects ?? options.languages.map((language) => ({
    path: language.projectPath,
    commands: { build: undefined, test: undefined, lint: undefined },
  }));
  const overrides = { build: options.buildCommand, test: options.testCommand, lint: options.lintCommand };
  const commands = projects.map((project) => {
    const lines = (["build", "test", "lint"] as const).map((name) => {
      const command = overrides[name] ?? project.commands[name];
      if (!command) return `- ${name}: NOT_RECORDED. Inspect project documentation and configuration.`;
      const source = overrides[name] !== undefined ? "user supplied" : "declared Hatch script";
      return `- ${name}: \`${command.replaceAll("`", "\\`")}\` (${source}; unverified).`;
    });
    return `### Project \`${project.path}\`\n\nRun commands from this project directory, relative to the repository root identified above.\n${lines.join("\n")}`;
  }).join("\n\n");
  const score = context?.score;
  const scoreText = score?.kind === "recorded"
    ? `Recorded score: ${score.score}/100, saved ${score.timestamp} in .btar-score.`
    : score?.kind === "invalid" ? "INVALID or incompatible .btar-score. Inspect it before relying on it." : "NOT_RECORDED.";
  const report = context?.report;
  const measurement = (value: { kind: "measured"; value: number } | { kind: "unavailable" }, suffix = ""): string =>
    value.kind === "measured" ? `${value.value}${suffix}` : "unavailable";
  const reportProjects = report?.projects.map(({ path, metrics }) =>
    `- \`${path}\`: type errors ${measurement(metrics.typeErrors)}, lint errors ${measurement(metrics.lintErrors)}, coverage ${measurement(metrics.coverage, "%")}.`
  ).join("\n");
  const evidence = report
    ? `Supplied historical analysis report: \`${report.source}\` (SHA256 \`${report.hash}\`). This is not a live verification.\n\n${reportProjects}\n\nA parsed measurement does not prove that checks passed. Coverage alone does not prove all tests passed.`
    : "Failure evidence: NOT_RECORDED. In a trusted project, capture it with `btar analyze . --json --trust-project > baseline.json`, then regenerate with `--baseline-report baseline.json`. Review the report before relying on it.";
  const roots = projects.map((project) => `\`${project.path}\``).join(", ");
  const paths = context?.paths.length ? context.paths.map((path) => {
    const destination = posix.join(repositoryRoot, path).split("/").map((part) =>
      encodeURIComponent(part).replaceAll("(", "%28").replaceAll(")", "%29")
    ).join("/");
    return `[${path}](${destination})`;
  }).join(", ") : "none recorded";
  return managedBlock(`# ${options.projectName}

## Repository map

Repository root relative to this file: \`${repositoryRoot}\`. Project roots and existing paths below are relative to that repository root.
Detected Python project roots: ${roots}.
Existing root paths: ${paths}. Inspect existing README and architecture documents before claiming module ownership.

## Repository constraints

Read existing instructions, including nested AGENTS.md files, before changing their scope. Preserve project packaging and configuration, source inputs, exclusions, and recorded baselines unless the task explicitly requires changes. Inspect the repository before changing its conventions.

## Build, testing, and code style

${commands}

BTAR target preparation guidance, not observed or verified project commands: \`hatch env create\`, \`hatch run pytest --cov --cov-report=term-missing\`, \`hatch run ruff check . && hatch run ruff format --check .\`, \`hatch run pyrefly check\`, \`gitleaks detect --no-banner\`, and \`hatch run semgrep scan --config p/python --error --strict\`. Python 3.14 or newer, Hatch, Hypothesis, Gitleaks, and Semgrep are part of the BTAR target profile. Check project configuration before use.

## Baseline evidence

${scoreText} A recorded score does not identify individual failures or prove current checks pass.

${evidence}

## pstack setup

Install the complete skill set with \`npx skills add backnotprop/pstack\`, then run \`/setup-pstack\` and \`/poteto-mode\`. See the [pstack README](https://github.com/backnotprop/pstack#readme). BTAR does not install skills or configure models.
`);
}
