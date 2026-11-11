/**
 * Configuration Loader Tests
 *
 * TDD: RED phase - these tests should FAIL initially
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, DEFAULT_CONFIG } from "./config.js";
import { ConfigError } from "./types.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("loadConfig", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "btar-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("when .btar.yaml exists", () => {
    it("parses valid config and merges with defaults", async () => {
      const configContent = `
thresholds:
  type_strictness: 5
  test_coverage: 80
exclude:
  - "custom/**"
`;
      await fs.writeFile(path.join(tempDir, ".btar.yaml"), configContent);

      const config = await loadConfig(tempDir);

      // Custom values override defaults
      expect(config.thresholds.type_strictness).toBe(5);
      expect(config.thresholds.test_coverage).toBe(80);
      // Defaults for missing values
      expect(config.thresholds.lint_errors).toBe(DEFAULT_CONFIG.thresholds.lint_errors);
      expect(config.thresholds.ci_time).toBe(DEFAULT_CONFIG.thresholds.ci_time);
      expect(config.thresholds.flaky_rate).toBe(DEFAULT_CONFIG.thresholds.flaky_rate);
      // Custom exclude
      expect(config.exclude).toEqual(["custom/**"]);
    });

    it("handles partial config with defaults for missing fields", async () => {
      const configContent = `
languages:
  - python
`;
      await fs.writeFile(path.join(tempDir, ".btar.yaml"), configContent);

      const config = await loadConfig(tempDir);

      // Custom languages
      expect(config.languages).toEqual(["python"]);
      // All thresholds default
      expect(config.thresholds).toEqual(DEFAULT_CONFIG.thresholds);
      // Exclude defaults
      expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
    });

    it("ignores unknown keys for forward compatibility", async () => {
      const configContent = `
thresholds:
  type_strictness: 0
future_feature: enabled
some_new_option:
  nested: value
`;
      await fs.writeFile(path.join(tempDir, ".btar.yaml"), configContent);

      const config = await loadConfig(tempDir);

      // Should not throw, unknown keys ignored
      expect(config.thresholds.type_strictness).toBe(0);
      // Standard fields still work
      expect(config.exclude).toEqual(DEFAULT_CONFIG.exclude);
    });
  });

  describe("when .btar.yaml is missing", () => {
    it("returns DEFAULT_CONFIG", async () => {
      const config = await loadConfig(tempDir);

      expect(config).toEqual(DEFAULT_CONFIG);
    });
  });

  describe("when .btar.yaml is invalid YAML", () => {
    it("throws ConfigError with descriptive message", async () => {
      const invalidYaml = `
thresholds:
  type_strictness: 0
  bad indent
`;
      await fs.writeFile(path.join(tempDir, ".btar.yaml"), invalidYaml);

      await expect(loadConfig(tempDir)).rejects.toThrow(ConfigError);
    });

    it("includes line number in error when available", async () => {
      const invalidYaml = `
thresholds:
  type_strictness: 0
  [invalid: yaml
`;
      await fs.writeFile(path.join(tempDir, ".btar.yaml"), invalidYaml);

      try {
        await loadConfig(tempDir);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigError);
        if (error instanceof ConfigError) {
          expect(error.message).toContain("Invalid YAML");
        }
      }
    });
  });

  it.each([
    'languages: [typescript]', 'exclude: true', 'exclude: [1]',
    'thresholds: []', 'thresholds: { test_coverage: 101 }',
    'thresholds: { lint_errors: -1 }', 'thresholds: { flaky_rate: .nan }',
  ])("rejects invalid boundary configuration %s", async (content) => {
    await fs.writeFile(path.join(tempDir, ".btar.yaml"), content);
    await expect(loadConfig(tempDir)).rejects.toThrow(ConfigError);
  });

  it("does not silently ignore a missing explicit config", async () => {
    await expect(loadConfig(tempDir, "missing.yaml")).rejects.toThrow(ConfigError);
  });

  it("loads an explicit configuration and isolates defaults", async () => {
    await fs.writeFile(path.join(tempDir, "custom.yaml"), 'exclude: ["legacy/**"]');
    expect((await loadConfig(tempDir, "custom.yaml")).exclude).toEqual(["legacy/**"]);
    const first = await loadConfig(tempDir);
    first.exclude.push("mutated");
    expect((await loadConfig(tempDir)).exclude).not.toContain("mutated");
  });

  describe("DEFAULT_CONFIG", () => {
    it("has expected default thresholds", () => {
      expect(DEFAULT_CONFIG.thresholds.type_strictness).toBe(0);
      expect(DEFAULT_CONFIG.thresholds.lint_errors).toBe(0);
      expect(DEFAULT_CONFIG.thresholds.test_coverage).toBe(70);
      expect(DEFAULT_CONFIG.thresholds.ci_time).toBe(600);
      expect(DEFAULT_CONFIG.thresholds.flaky_rate).toBe(1);
    });

    it("has expected default excludes", () => {
      expect(DEFAULT_CONFIG.exclude).toContain("node_modules/**");
      expect(DEFAULT_CONFIG.exclude).toContain("dist/**");
      expect(DEFAULT_CONFIG.exclude).toContain("vendor/**");
      expect(DEFAULT_CONFIG.exclude).toContain("*.generated.*");
    });

    it("has empty languages by default (auto-detect)", () => {
      expect(DEFAULT_CONFIG.languages).toEqual([]);
    });
  });
});
