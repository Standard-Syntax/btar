export type SupportedLanguage = "python";

export type BuildSystem = "hatch" | "legacy-python";

export interface DetectedLanguage {
  language: "python";
  confidence: "high" | "medium";
  markers: string[];
  buildSystem: BuildSystem;
}

export interface ThresholdConfig {
  type_strictness: number;
  lint_errors: number;
  test_coverage: number;
  ci_time: number;
  flaky_rate: number;
}

export interface BTARConfig {
  thresholds: ThresholdConfig;
  exclude: string[];
  languages: SupportedLanguage[];
}

export class ConfigError extends Error {
  constructor(message: string, public readonly line?: number, public readonly column?: number) {
    super(message);
    this.name = "ConfigError";
  }
}
