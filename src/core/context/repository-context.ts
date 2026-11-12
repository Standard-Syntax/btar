import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadRatchetScore } from "../remediation/ratchet.js";
import type { DetectedLanguage } from "../types.js";

type Measurement = { kind: "measured"; value: number } | { kind: "unavailable" };
type BaselineScore = { kind: "recorded"; score: number; timestamp: string } | { kind: "missing" } | { kind: "invalid" };
type MetricName = "typeErrors" | "lintErrors" | "coverage";
interface ProjectContext { path: string; commands: Record<"build" | "test" | "lint", string | undefined>; }
export interface RepositoryAgentContext {
  projects: ProjectContext[];
  paths: string[];
  score: BaselineScore;
  report: { source: string; hash: string; projects: { path: string; metrics: Record<MetricName, Measurement> }[] } | undefined;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hatchScripts(directory: string): Record<string, unknown> {
  try {
    const pyproject = join(directory, "pyproject.toml");
    const parsed: unknown = existsSync(pyproject) ? Bun.TOML.parse(readFileSync(pyproject, "utf8")) : {};
    let hatch: unknown = record(parsed) && record(parsed.tool) ? parsed.tool.hatch : undefined;
    const standalone = join(directory, "hatch.toml");
    if (existsSync(standalone)) {
      const value: unknown = Bun.TOML.parse(readFileSync(standalone, "utf8"));
      if (record(value) && "envs" in value) hatch = value;
    }
    if (!record(hatch) || !record(hatch.envs) || !record(hatch.envs.default) || !record(hatch.envs.default.scripts)) return {};
    return hatch.envs.default.scripts;
  } catch { return {}; }
}

function parseReport(path: string, languages: DetectedLanguage[]): NonNullable<RepositoryAgentContext["report"]> {
  const bytes = readFileSync(path);
  const data: unknown = JSON.parse(bytes.toString("utf8"));
  if (!record(data) || !Array.isArray(data.languages) || !record(data.metrics)) throw new Error("Invalid baseline report shape.");
  const expected = languages.map((language) => language.projectPath).sort();
  const roots = data.languages.map((entry: unknown) => record(entry) && entry.language === "python" && typeof entry.projectPath === "string" ? entry.projectPath : null);
  if (roots.some((root) => root === null) || JSON.stringify(roots.sort()) !== JSON.stringify(expected)) throw new Error("Baseline report project scope does not match detected projects.");
  const specs = [
    ["typeStrictness", "type_strictness", "pyrefly", "typeErrors"],
    ["lintErrors", "lint_errors", "ruff", "lintErrors"],
    ["coverage", "test_coverage", "pytest-cov", "coverage"],
  ] as const;
  const keys = expected.map((root) => root === "." ? "python" : `python:${root}`).sort();
  const metricsByProject = new Map<string, Partial<Record<MetricName, Measurement>>>(expected.map((root) => [root, {}]));
  for (const [field, metric, tool, name] of specs) {
    const entries = data.metrics[field];
    if (!record(entries) || JSON.stringify(Object.keys(entries).sort()) !== JSON.stringify(keys)) throw new Error(`Invalid baseline report ${field} keys.`);
    for (const root of expected) {
      const entry = entries[root === "." ? "python" : `python:${root}`];
      if (!record(entry) || entry.metric !== metric || entry.tool !== tool ||
          typeof entry.success !== "boolean" || typeof entry.value !== "number" ||
          !Number.isFinite(entry.value) ||
          (entry.success && (entry.value < 0 || (field === "coverage" && entry.value > 100) ||
            (field !== "coverage" && !Number.isInteger(entry.value)))) ||
          (!entry.success && entry.value !== -1)) {
        throw new Error(`Invalid baseline report ${field} measurement.`);
      }
      const measurements = metricsByProject.get(root);
      if (!measurements) throw new Error("Invalid baseline project.");
      measurements[name] = entry.success ? { kind: "measured", value: entry.value } : { kind: "unavailable" };
    }
  }
  const projects = expected.map((path) => {
    const metrics = metricsByProject.get(path);
    if (!metrics?.typeErrors || !metrics.lintErrors || !metrics.coverage) throw new Error("Incomplete baseline report.");
    return { path, metrics: { typeErrors: metrics.typeErrors, lintErrors: metrics.lintErrors, coverage: metrics.coverage } };
  });
  return { source: path, hash: createHash("sha256").update(bytes).digest("hex"), projects };
}

export async function inspectRepository(directory: string, languages: DetectedLanguage[], reportPath?: string, exclude: string[] = []): Promise<RepositoryAgentContext> {
  const projects = languages.map(({ projectPath }) => {
    const scripts = hatchScripts(resolve(directory, projectPath));
    const command = (name: string): string | undefined => typeof scripts[name] === "string" || (Array.isArray(scripts[name]) && scripts[name].length > 0 && scripts[name].every((item: unknown) => typeof item === "string")) ? `hatch run ${name}` : undefined;
    return { path: projectPath, commands: { build: command("build"), test: command("test"), lint: command("lint") } };
  });
  const paths = ["README.md", "ARCHITECTURE.md", "docs/architecture.md", "docs/ARCHITECTURE.md", "docs", "src", "tests", "pyproject.toml", "hatch.toml"].filter((path) => existsSync(join(directory, path)) && !exclude.some((pattern) => new Bun.Glob(pattern).match(path) || (pattern.endsWith("/**") && (path === pattern.slice(0, -3) || path.startsWith(`${pattern.slice(0, -3)}/`)))));
  let score: BaselineScore;
  try {
    const stored = await loadRatchetScore(directory, languages.map((language) => language.projectPath));
    score = stored ? { kind: "recorded", score: stored.score, timestamp: stored.timestamp } : { kind: "missing" };
  } catch { score = { kind: "invalid" }; }
  return { projects, paths, score, report: reportPath ? parseReport(resolve(reportPath), languages) : undefined };
}

const START = "<!-- BTAR:START -->";
const END = "<!-- BTAR:END -->";
function blockMarkers(content: string): { kind: string; index: number; length: number }[] {
  const markers: { kind: string; index: number; length: number }[] = [];
  let fence: { character: string; length: number } | undefined;
  for (const line of content.matchAll(/[^\n]+|\n/g)) {
    const delimiter = line[0].match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter && (fence || delimiter[1][0] !== "`" || !line[0].slice(delimiter[0].length).includes("`"))) {
      if (!fence) fence = { character: delimiter[1][0], length: delimiter[1].length };
      else if (delimiter[1][0] === fence.character && delimiter[1].length >= fence.length && /^ {0,3}(?:`+|~+)\s*$/.test(line[0])) fence = undefined;
      continue;
    }
    const marker = line[0].match(/^<!-- BTAR:(START|END) -->\r?$/);
    if (!fence && marker) markers.push({ kind: marker[1], index: line.index, length: marker[0].replace(/\r$/, "").length });
  }
  if (fence) throw new Error("Cannot update context with an unclosed Markdown code fence.");
  return markers;
}
export function updateManagedBlock(existing: Buffer, generated: string): Buffer {
  const content = existing.toString("latin1");
  const markers = blockMarkers(content);
  const generatedMarkers = [...generated.matchAll(/^<!-- BTAR:(START|END) -->(?=\r?$)/gm)];
  if (generatedMarkers.length !== 2 || generatedMarkers[0][1] !== "START" || generatedMarkers[1][1] !== "END") {
    throw new Error("Generated content contains reserved BTAR markers.");
  }
  if (markers.length === 0) {
    const separator = existing.length > 0 && existing[existing.length - 1] !== 10 ? Buffer.from("\n") : Buffer.alloc(0);
    return Buffer.concat([existing, separator, Buffer.from(generated)]);
  }
  if (markers.length !== 2 || markers[0].kind !== "START" || markers[1].kind !== "END") {
    throw new Error("Malformed or duplicate BTAR managed block markers.");
  }
  const block = generated.slice(0, generated.lastIndexOf(END) + END.length);
  const end = markers[1].index + markers[1].length;
  return Buffer.concat([existing.subarray(0, markers[0].index), Buffer.from(block), existing.subarray(end)]);
}
export function managedBlock(content: string): string {
  if (/^<!-- BTAR:(?:START|END) -->(?=\r?$)/m.test(content)) throw new Error("Generated content contains reserved BTAR markers.");
  blockMarkers(content);
  return `${START}\n${content}${END}\n`;
}
