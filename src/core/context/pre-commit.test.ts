/**
 * Pre-commit Configuration Generator Tests
 *
 * Tests for generating .pre-commit-config.yaml files
 */

import { describe, it, expect } from "vitest";
import * as yaml from "yaml";
import {
  generatePreCommitConfig,
  getHooksForLanguage,
  type PreCommitConfig,
} from "./pre-commit.js";
import type { DetectedLanguage } from "../types.js";

/**
 * Helper to create a DetectedLanguage for testing
 */
function createLanguage(
  language: DetectedLanguage["language"],
  markers: string[] = []
): DetectedLanguage {
  return {
    language,
    confidence: "high",
    markers: markers.length > 0 ? markers : [language],
  };
}

describe("getHooksForLanguage", () => {
  it("returns hooks for TypeScript", () => {
    const hooks = getHooksForLanguage("typescript");
    expect(hooks.length).toBeGreaterThan(0);

    // Should include prettier and eslint
    const repoUrls = hooks.map((h) => h.repo);
    expect(repoUrls.some((url) => url.includes("prettier"))).toBe(true);
    expect(repoUrls.some((url) => url.includes("eslint"))).toBe(true);
  });

  it("returns hooks for Python", () => {
    const hooks = getHooksForLanguage("python");
    expect(hooks.length).toBeGreaterThan(0);

    // Should include Ruff and Pyrefly
    const repoUrls = hooks.map((h) => h.repo);
    expect(repoUrls.some((url) => url.includes("black"))).toBe(false);
    expect(repoUrls.some((url) => url.includes("ruff"))).toBe(true);
    expect(repoUrls.some((url) => url.includes("pyrefly"))).toBe(true);
  });

  it("returns hooks for Go", () => {
    const hooks = getHooksForLanguage("go");
    expect(hooks.length).toBeGreaterThan(0);

    const repoUrls = hooks.map((h) => h.repo);
    expect(repoUrls.some((url) => url.includes("golangci-lint"))).toBe(true);
  });

  it("returns hooks for all supported languages", () => {
    const languages: DetectedLanguage["language"][] = [
      "typescript",
      "javascript",
      "python",
      "go",
      "swift",
      "kotlin",
      "java",
      "ruby",
      "php",
    ];

    for (const lang of languages) {
      const hooks = getHooksForLanguage(lang);
      expect(hooks.length).toBeGreaterThan(0, `Expected hooks for ${lang}`);
    }
  });
});

describe("generatePreCommitConfig", () => {
  describe("single language", () => {
    it("generates config for TypeScript only", () => {
      const languages = [createLanguage("typescript", ["tsconfig.json"])];
      const configYaml = generatePreCommitConfig(languages);

      // Should be valid YAML
      const config = yaml.parse(configYaml) as PreCommitConfig;
      expect(config).toHaveProperty("repos");
      expect(Array.isArray(config.repos)).toBe(true);

      // Should include base hooks
      const baseRepo = config.repos.find((r) =>
        r.repo.includes("pre-commit-hooks")
      );
      expect(baseRepo).toBeDefined();
      expect(baseRepo?.hooks.some((h) => h.id === "trailing-whitespace")).toBe(
        true
      );

      // Should include TypeScript hooks
      const prettierRepo = config.repos.find((r) =>
        r.repo.includes("prettier")
      );
      expect(prettierRepo).toBeDefined();

      const eslintRepo = config.repos.find((r) => r.repo.includes("eslint"));
      expect(eslintRepo).toBeDefined();
    });

    it("generates config for Python only", () => {
      const languages = [createLanguage("python", ["pyproject.toml"])];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // Should include Python-specific hooks
      const pyreflyRepo = config.repos.find((r) => r.repo.includes("pyrefly"));
      expect(pyreflyRepo?.hooks[0]).toEqual({
        id: "pyrefly-check", pass_filenames: false, language: "system",
      });

      const ruffRepo = config.repos.find((r) => r.repo.includes("ruff"));
      expect(ruffRepo).toBeDefined();
    });
  });

  describe("multiple languages", () => {
    it("generates combined config for Python + TypeScript", () => {
      const languages = [
        createLanguage("python", ["pyproject.toml"]),
        createLanguage("typescript", ["tsconfig.json"]),
      ];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // Should have base hooks
      expect(config.repos.some((r) => r.repo.includes("pre-commit-hooks"))).toBe(
        true
      );

      // Should have Python hooks
      expect(config.repos.some((r) => r.repo.includes("pyrefly"))).toBe(true);
      expect(config.repos.some((r) => r.repo.includes("ruff"))).toBe(true);

      // Should have TypeScript hooks
      expect(config.repos.some((r) => r.repo.includes("prettier"))).toBe(true);
      expect(config.repos.some((r) => r.repo.includes("eslint"))).toBe(true);
    });

    it("de-duplicates repos when languages share hooks", () => {
      const languages = [
        createLanguage("typescript", ["tsconfig.json"]),
        createLanguage("javascript", ["package.json"]),
      ];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // Prettier should only appear once
      const prettierRepos = config.repos.filter((r) =>
        r.repo.includes("prettier")
      );
      expect(prettierRepos.length).toBe(1);

      // ESLint should only appear once
      const eslintRepos = config.repos.filter((r) => r.repo.includes("eslint"));
      expect(eslintRepos.length).toBe(1);
    });
  });

  describe("unknown/empty languages", () => {
    it("returns base hooks only for empty language array", () => {
      const languages: DetectedLanguage[] = [];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // Should have exactly 1 repo (base hooks)
      expect(config.repos.length).toBe(1);
      expect(config.repos[0].repo).toContain("pre-commit-hooks");
    });
  });

  describe("YAML output", () => {
    it("generates parseable YAML", () => {
      const languages = [
        createLanguage("python"),
        createLanguage("go"),
        createLanguage("ruby"),
      ];
      const configYaml = generatePreCommitConfig(languages);

      // Should not throw when parsing
      expect(() => yaml.parse(configYaml)).not.toThrow();
    });

    it("includes all required fields in output", () => {
      const languages = [createLanguage("typescript")];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // Each repo should have required fields
      for (const repo of config.repos) {
        expect(repo).toHaveProperty("repo");
        expect(repo).toHaveProperty("rev");
        expect(repo).toHaveProperty("hooks");
        expect(Array.isArray(repo.hooks)).toBe(true);

        for (const hook of repo.hooks) {
          expect(hook).toHaveProperty("id");
        }
      }
    });

    it("includes version pins for reproducibility", () => {
      const languages = [createLanguage("python")];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      // All repos should have non-empty rev
      for (const repo of config.repos) {
        expect(repo.rev).toBeTruthy();
        expect(repo.rev.length).toBeGreaterThan(0);
      }
    });
  });

  describe("hook configuration details", () => {
    it("includes file patterns for TypeScript hooks", () => {
      const languages = [createLanguage("typescript")];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      const prettierRepo = config.repos.find((r) =>
        r.repo.includes("prettier")
      );
      expect(prettierRepo?.hooks[0].files).toContain("ts");
    });

    it("includes additional dependencies for ESLint TypeScript", () => {
      const languages = [createLanguage("typescript")];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      const eslintRepo = config.repos.find((r) => r.repo.includes("eslint"));
      const eslintHook = eslintRepo?.hooks[0];
      expect(eslintHook?.additional_dependencies).toBeDefined();
      expect(eslintHook?.additional_dependencies).toContain(
        "@typescript-eslint/parser"
      );
    });

    it("includes args for ruff hooks", () => {
      const languages = [createLanguage("python")];
      const configYaml = generatePreCommitConfig(languages);

      const config = yaml.parse(configYaml) as PreCommitConfig;

      const ruffRepo = config.repos.find((r) => r.repo.includes("ruff"));
      const ruffHook = ruffRepo?.hooks.find((h) => h.id === "ruff");
      expect(ruffHook?.args).toContain("--fix");
    });
  });
});
