import { createHash } from "node:crypto";
import { closeSync, constants, existsSync, fstatSync, lstatSync, openSync, readFileSync, readSync } from "node:fs";
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
  const parse = (path: string): unknown => {
    try { return Bun.TOML.parse(readFileSync(path, "utf8")); }
    catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        try { lstatSync(path); }
        catch (statError) {
          if (statError instanceof Error && "code" in statError && statError.code === "ENOENT") return {};
        }
      }
      throw new Error(`Cannot read or parse ${path}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
  };
  const parsed = parse(join(directory, "pyproject.toml"));
  let hatch: unknown = record(parsed) && record(parsed.tool) ? parsed.tool.hatch : undefined;
  const standalone = parse(join(directory, "hatch.toml"));
  if (record(standalone) && "envs" in standalone) hatch = standalone;
  if (!record(hatch) || !record(hatch.envs) || !record(hatch.envs.default) || !record(hatch.envs.default.scripts)) return {};
  return hatch.envs.default.scripts;
}

const MAX_REPORT_BYTES = 10 * 1024 * 1024;
function readReport(path: string): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error(`Baseline report must be a regular file: ${path}`);
    if (stat.size > MAX_REPORT_BYTES) throw new Error(`Baseline report exceeds size limit: ${path}`);
    const buffer = Buffer.alloc(MAX_REPORT_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = readSync(fd, buffer, length, buffer.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length > MAX_REPORT_BYTES) throw new Error(`Baseline report exceeds size limit: ${path}`);
    return buffer.subarray(0, length);
  } finally { closeSync(fd); }
}

function parseReport(path: string, languages: DetectedLanguage[]): NonNullable<RepositoryAgentContext["report"]> {
  const bytes = readReport(path);
  const data: unknown = JSON.parse(bytes.toString("utf8"));
  if (!record(data) || !Array.isArray(data.languages) || !record(data.metrics)) throw new Error("Invalid baseline report shape.");
  const expected = languages.map((language) => language.projectPath).sort();
  const roots = data.languages.map((entry: unknown) => record(entry) && entry.language === "python" && typeof entry.projectPath === "string" ? entry.projectPath : null);
  if (new Set(roots).size !== roots.length) throw new Error("Duplicate baseline report project roots.");
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
  const roots = languages.map((language) => language.projectPath);
  if (new Set(roots).size !== roots.length) throw new Error("Duplicate detected project roots.");
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
const HTML_ATTRIBUTE = "[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \\t]*=[ \\t]*(?:[^\\t\\n\\f\\r \"'=<>`]+|'[^']*'|\"[^\"]*\"))?";
const GENERIC_HTML_OPEN_BLOCK = new RegExp(`^ {0,3}<(?!(?:script|pre|style|textarea)(?=[\\s/>]|$))[A-Za-z][A-Za-z0-9-]*(?:[ \\t]+${HTML_ATTRIBUTE})*[ \\t]*\\/?>[ \\t]*$`, "i");
const GENERIC_HTML_CLOSE_BLOCK = /^ {0,3}<\/[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$/;

function blockMarkers(content: string): { kind: string; index: number; length: number }[] {
  const markers: { kind: string; index: number; length: number }[] = [];
  type Literal = { kind: "fence"; character: string; length: number } | { kind: "html"; end: RegExp };
  let literal: Literal | undefined;
  for (const line of content.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)) {
    if (!line[0]) continue;
    const text = line[0].replace(/(?:\r\n|\r|\n)$/, "");
    if (literal?.kind === "html") {
      if (literal.end.test(text)) literal = undefined;
      continue;
    }
    const delimiter = text.match(/^ {0,3}(`{3,}|~{3,})/);
    if (delimiter && (literal || delimiter[1][0] !== "`" || !text.slice(delimiter[0].length).includes("`"))) {
      if (!literal) literal = { kind: "fence", character: delimiter[1][0], length: delimiter[1].length };
      else if (delimiter[1][0] === literal.character && delimiter[1].length >= literal.length && /^ {0,3}(?:`+|~+)[ \t]*$/.test(text)) literal = undefined;
      continue;
    }
    if (literal) continue;
    const marker = text.match(/^<!-- BTAR:(START|END) -->$/);
    if (marker) {
      markers.push({ kind: marker[1], index: line.index, length: text.length });
      continue;
    }
    if (/^[ \t]*<!--\s*BTAR\s*:/i.test(text)) {
      throw new Error("Malformed or duplicate BTAR managed block markers.");
    }
    let end: RegExp | undefined;
    const rawTag = text.match(/^ {0,3}<(script|pre|style|textarea)(?:\s|>|$)/i);
    if (rawTag) end = new RegExp(`</${rawTag[1]}>`, "i");
    else if (/^ {0,3}<!--/.test(text)) end = /-->/;
    else if (/^ {0,3}<\?/.test(text)) end = /\?>/;
    else if (/^ {0,3}<!\[CDATA\[/.test(text)) end = /\]\]>/;
    else if (/^ {0,3}<![A-Z]/.test(text)) end = />/;
    else if (/^ {0,3}<\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?=[\s/>]|$)/i.test(text) ||
      GENERIC_HTML_OPEN_BLOCK.test(text) || GENERIC_HTML_CLOSE_BLOCK.test(text)) end = /^[ \t]*$/;
    if (end && !end.test(text)) literal = { kind: "html", end };
  }
  if (literal?.kind === "fence") throw new Error("Cannot update context with an unclosed Markdown code fence.");
  if (literal?.kind === "html") throw new Error("Cannot update context with an unclosed Markdown HTML block.");
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
