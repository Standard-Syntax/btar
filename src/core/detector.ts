import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { BTARConfig, BuildSystem, DetectedLanguage } from "./types.js";

export interface LanguageMarker { primary: string[]; secondary: string[]; }

export const LANGUAGE_MARKERS: { python: LanguageMarker } = {
  python: { primary: ["pyproject.toml", "hatch.toml", "setup.py"], secondary: ["requirements.txt", "Pipfile", "setup.cfg"] },
};

function shouldExclude(filePath: string, baseDir: string, patterns: string[]): boolean {
  const relativePath = relative(baseDir, filePath).split("\\").join("/");
  return patterns.some((pattern) => new Bun.Glob(pattern).match(relativePath) ||
    (pattern.endsWith("/**") && new Bun.Glob(pattern.slice(0, -3)).match(relativePath)));
}

export function detectBuildSystem(directory: string): BuildSystem {
  if (existsSync(join(directory, "hatch.toml"))) return "hatch";
  const pyproject = join(directory, "pyproject.toml");
  if (!existsSync(pyproject)) return "legacy-python";
  try {
    const contents = readFileSync(pyproject, "utf8");
    return /\[tool\.hatch(?:\.|\])|build-backend\s*=\s*["']hatchling/.test(contents) ? "hatch" : "legacy-python";
  } catch { return "legacy-python"; }
}

function detectInDirectory(directory: string, root: string, config: BTARConfig): DetectedLanguage | undefined {
  let files: string[];
  try { files = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name); } catch { return undefined; }
  const projectPath = relative(root, directory).split("\\").join("/") || ".";
  for (const confidence of ["high", "medium"] as const) {
    const markers = confidence === "high" ? LANGUAGE_MARKERS.python.primary : LANGUAGE_MARKERS.python.secondary;
    const marker = markers.find((file) => files.includes(file) && !shouldExclude(join(directory, file), root, config.exclude));
    if (marker) return { language: "python", projectPath, confidence, markers: [relative(root, join(directory, marker))], buildSystem: detectBuildSystem(directory) };
  }
  if (files.some((file) => file.endsWith(".py") && !shouldExclude(join(directory, file), root, config.exclude))) {
    return { language: "python", projectPath, confidence: "medium", markers: [relative(root, directory) || "."], buildSystem: detectBuildSystem(directory) };
  }
  return undefined;
}

export async function detectLanguages(directory: string, config: BTARConfig): Promise<DetectedLanguage[]> {
  if (!existsSync(directory)) return [];
  const projects: DetectedLanguage[] = [];
  const pending = [directory];
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) break;
    const detected = detectInDirectory(current, directory, config);
    if (detected) {
      projects.push(detected);
      continue;
    }
    try {
      const children = readdirSync(current, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && ![".git", ".venv", "venv", ".tox", ".nox", ".pytest_cache", ".mypy_cache", ".ruff_cache", "__pycache__", "build", "dist", "node_modules", "vendor"].includes(entry.name))
        .sort((a, b) => b.name.localeCompare(a.name));
      for (const entry of children) {
        const child = join(current, entry.name);
        if (!shouldExclude(child, directory, config.exclude)) {
          pending.push(child);
        }
      }
    } catch { continue; }
  }
  return projects;
}
