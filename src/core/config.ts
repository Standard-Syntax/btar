import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as YAML from "yaml";
import type { BTARConfig } from "./types.js";
import { ConfigError } from "./types.js";

export const DEFAULT_CONFIG: BTARConfig = {
  thresholds: { type_strictness: 0, lint_errors: 0, test_coverage: 70, ci_time: 600, flaky_rate: 1 },
  exclude: ["node_modules/**", "dist/**", "vendor/**", ".venv/**", ".hatch/**", "*.generated.*"],
  languages: [],
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseConfig(value: unknown): BTARConfig {
  const config: BTARConfig = {
    thresholds: { ...DEFAULT_CONFIG.thresholds },
    exclude: [...DEFAULT_CONFIG.exclude], languages: [],
  };
  if (value === null || value === undefined) return config;
  if (!record(value)) throw new ConfigError("Invalid YAML: config must be an object");
  if (value.exclude !== undefined) {
    if (!Array.isArray(value.exclude) || !value.exclude.every((item: unknown) => typeof item === "string")) {
      throw new ConfigError("exclude must be an array of glob strings");
    }
    config.exclude = value.exclude;
  }
  if (value.languages !== undefined) {
    if (!Array.isArray(value.languages) || !value.languages.every((item: unknown) => item === "python")) {
      throw new ConfigError("languages may only contain python");
    }
    config.languages = value.languages.map(() => "python");
  }
  if (value.thresholds !== undefined) {
    if (!record(value.thresholds)) throw new ConfigError("thresholds must be an object");
    const keys = ["type_strictness", "lint_errors", "test_coverage", "ci_time", "flaky_rate"] as const;
    for (const key of keys) {
      const threshold = value.thresholds[key];
      if (threshold === undefined) continue;
      if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0 ||
          ((key === "test_coverage" || key === "flaky_rate") && threshold > 100)) {
        throw new ConfigError(`Invalid threshold: ${key}`);
      }
      config.thresholds[key] = threshold;
    }
  }
  return config;
}

export async function loadConfig(directory: string, configPath?: string): Promise<BTARConfig> {
  const destination = configPath ? path.resolve(directory, configPath) : path.join(directory, ".btar.yaml");
  let content: string;
  try {
    content = await fs.readFile(destination, "utf8");
  } catch (error) {
    if (!configPath && error instanceof Error && "code" in error && error.code === "ENOENT") return parseConfig(null);
    throw new ConfigError(`Failed to read config file ${destination}: ${String(error)}`);
  }
  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    if (error instanceof YAML.YAMLParseError) {
      throw new ConfigError(`Invalid YAML in ${destination}: ${error.message}`, error.linePos?.[0]?.line, error.linePos?.[0]?.col);
    }
    throw new ConfigError(`Invalid YAML in ${destination}: ${String(error)}`);
  }
  return parseConfig(parsed);
}
