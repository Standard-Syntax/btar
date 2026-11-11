import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { generatePreCommitConfig } from "./pre-commit.js";
import type { DetectedLanguage } from "../types.js";

const project = (projectPath: string, buildSystem: "hatch" | "legacy-python"): DetectedLanguage => ({ language: "python", projectPath, buildSystem, confidence: "high", markers: [] });

describe("generatePreCommitConfig", () => {
  it("pins exact Python quality and security hooks for a root Hatch project", () => {
    const config = yaml.parse(generatePreCommitConfig([project(".", "hatch")]));
    expect(config.repos).toEqual([
      { repo: "https://github.com/pre-commit/pre-commit-hooks", rev: "v5.0.0", hooks: [{ id: "trailing-whitespace" }, { id: "end-of-file-fixer" }, { id: "check-yaml" }, { id: "check-added-large-files" }] },
      { repo: "https://github.com/astral-sh/ruff-pre-commit", rev: "v0.17.4", hooks: [{ id: "ruff-check", args: ["--fix"] }, { id: "ruff-format" }] },
      { repo: "local", hooks: [{ id: "pyrefly", name: "Pyrefly through Hatch", entry: "hatch run pyrefly check", language: "system", types: ["python"], pass_filenames: false }] },
      { repo: "https://github.com/gitleaks/gitleaks", rev: "v8.24.2", hooks: [{ id: "gitleaks" }] },
      { repo: "https://github.com/semgrep/pre-commit", rev: "v1.185.0", hooks: [{ id: "semgrep", args: ["--config", "p/python", "--error", "--strict"] }] },
    ]);
  });
  it.each([[[]], [[project(".", "legacy-python")]], [[project("nested", "hatch")]], [[project(".", "legacy-python"), project("nested", "hatch")]]])("omits the Hatch hook without a root Hatch project", (languages) => {
    expect(yaml.parse(generatePreCommitConfig(languages)).repos.some((repo: { repo: string }) => repo.repo === "local")).toBe(false);
  });
});
