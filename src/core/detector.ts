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
  for (const confidence of ["high", "medium"] as const) {
    const markers = confidence === "high" ? LANGUAGE_MARKERS.python.primary : LANGUAGE_MARKERS.python.secondary;
    const marker = markers.find((file) => files.includes(file) && !shouldExclude(join(directory, file), root, config.exclude));
    if (marker) return { language: "python", confidence, markers: [relative(root, join(directory, marker))], buildSystem: detectBuildSystem(directory) };
  }
  if (files.some((file) => file.endsWith(".py") && !shouldExclude(join(directory, file), root, config.exclude))) {
    return { language: "python", confidence: "medium", markers: [relative(root, directory) || "."], buildSystem: detectBuildSystem(directory) };
  }
  return undefined;
}

export async function detectLanguages(directory: string, config: BTARConfig): Promise<DetectedLanguage[]> {
  if (!existsSync(directory)) return [];
  const root = detectInDirectory(directory, directory, config);
  if (root) return [root];
  try {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || [".git", ".venv", "build", "dist", "node_modules", "vendor"].includes(entry.name)) continue;
      const child = join(directory, entry.name);
      if (shouldExclude(child, directory, config.exclude)) continue;
      const detected = detectInDirectory(child, directory, config);
      if (detected) return [{ ...detected, buildSystem: detectBuildSystem(directory) }];
    }
  } catch { return []; }
  return [];
}
