import * as yaml from "yaml";
import type { DetectedLanguage } from "../types.js";

export interface PreCommitHook { id: string; args?: string[]; pass_filenames?: boolean; }
interface LocalHook extends PreCommitHook { name: string; entry: string; language: "system"; types: string[]; }
export type PreCommitRepo = { repo: string; rev: string; hooks: PreCommitHook[] } | { repo: "local"; hooks: LocalHook[] };
export interface PreCommitConfig { repos: PreCommitRepo[]; }

const PYTHON_REPOS: PreCommitRepo[] = [
  { repo: "https://github.com/pre-commit/pre-commit-hooks", rev: "v5.0.0", hooks: [{ id: "trailing-whitespace" }, { id: "end-of-file-fixer" }, { id: "check-yaml" }, { id: "check-added-large-files" }] },
  { repo: "https://github.com/astral-sh/ruff-pre-commit", rev: "v0.17.4", hooks: [{ id: "ruff-check", args: ["--fix"] }, { id: "ruff-format" }] },
  { repo: "local", hooks: [{ id: "pyrefly", name: "Pyrefly through Hatch", entry: "hatch run pyrefly check", language: "system", types: ["python"], pass_filenames: false }] },
  { repo: "https://github.com/gitleaks/gitleaks", rev: "v8.24.2", hooks: [{ id: "gitleaks" }] },
  { repo: "https://github.com/semgrep/pre-commit", rev: "v1.185.0", hooks: [{ id: "semgrep", args: ["--config", "p/python", "--error", "--strict"] }] },
];

export function getHooksForLanguage(): PreCommitRepo[] { return PYTHON_REPOS; }

export function generatePreCommitConfig(_languages: DetectedLanguage[]): string {
  return yaml.stringify({ repos: PYTHON_REPOS }, { indent: 2, lineWidth: 120, defaultStringType: "QUOTE_DOUBLE", defaultKeyType: "PLAIN" });
}
