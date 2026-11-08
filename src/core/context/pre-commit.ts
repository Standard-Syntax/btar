/**
 * Pre-commit Configuration Generator
 *
 * Generates .pre-commit-config.yaml files with appropriate hooks
 * for detected project languages.
 */

import * as yaml from "yaml";
import type { SupportedLanguage, DetectedLanguage } from "../types.js";

/**
 * A single pre-commit hook configuration
 */
export interface PreCommitHook {
  id: string;
  files?: string;
  args?: string[];
  additional_dependencies?: string[];
  pass_filenames?: boolean;
  language?: string;
}

/**
 * A repository containing pre-commit hooks
 */
export interface PreCommitRepo {
  repo: string;
  rev: string;
  hooks: PreCommitHook[];
}

/**
 * Complete pre-commit configuration
 */
export interface PreCommitConfig {
  repos: PreCommitRepo[];
}

/**
 * Well-known pre-commit repository URLs and versions
 */
const REPO_URLS = {
  preCommitHooks: "https://github.com/pre-commit/pre-commit-hooks",
  prettier: "https://github.com/pre-commit/mirrors-prettier",
  eslint: "https://github.com/pre-commit/mirrors-eslint",
  ruff: "https://github.com/astral-sh/ruff-pre-commit",
  pyrefly: "https://github.com/facebook/pyrefly-pre-commit",
  golangciLint: "https://github.com/golangci/golangci-lint",
  swiftformat: "https://github.com/nicklockwood/SwiftFormat",
  swiftlint: "https://github.com/realm/SwiftLint",
  ktlint: "https://github.com/JLLeitschuh/ktlint-gradle",
  googleJavaFormat: "https://github.com/google/google-java-format",
  rubocop: "https://github.com/rubocop/rubocop",
  phpCsFixer: "https://github.com/PHP-CS-Fixer/PHP-CS-Fixer",
} as const;

/**
 * Stable versions for pre-commit hooks (pinned for reproducibility)
 */
const REPO_VERSIONS = {
  preCommitHooks: "v4.5.0",
  prettier: "v3.1.0",
  eslint: "v8.56.0",
  ruff: "v0.17.4",
  pyrefly: "1.2.0",
  golangciLint: "v1.55.2",
  swiftformat: "0.53.0",
  swiftlint: "0.54.0",
  ktlint: "12.1.0",
  googleJavaFormat: "v1.19.2",
  rubocop: "v1.60.1",
  phpCsFixer: "v3.48.0",
} as const;

/**
 * Base hooks that should be included for all projects
 */
function getBaseHooks(): PreCommitRepo {
  return {
    repo: REPO_URLS.preCommitHooks,
    rev: REPO_VERSIONS.preCommitHooks,
    hooks: [
      { id: "trailing-whitespace" },
      { id: "end-of-file-fixer" },
      { id: "check-yaml" },
      { id: "check-added-large-files" },
    ],
  };
}

/**
 * Language-specific hook configurations
 */
const LANGUAGE_HOOKS: Record<SupportedLanguage, PreCommitRepo[]> = {
  typescript: [
    {
      repo: REPO_URLS.prettier,
      rev: REPO_VERSIONS.prettier,
      hooks: [
        {
          id: "prettier",
          files: "\\.(ts|tsx|js|jsx|json|css|scss|md)$",
        },
      ],
    },
    {
      repo: REPO_URLS.eslint,
      rev: REPO_VERSIONS.eslint,
      hooks: [
        {
          id: "eslint",
          files: "\\.(ts|tsx)$",
          additional_dependencies: ["@typescript-eslint/parser", "@typescript-eslint/eslint-plugin"],
        },
      ],
    },
  ],

  javascript: [
    {
      repo: REPO_URLS.prettier,
      rev: REPO_VERSIONS.prettier,
      hooks: [
        {
          id: "prettier",
          files: "\\.(js|jsx|json|css|scss|md)$",
        },
      ],
    },
    {
      repo: REPO_URLS.eslint,
      rev: REPO_VERSIONS.eslint,
      hooks: [
        {
          id: "eslint",
          files: "\\.(js|jsx)$",
        },
      ],
    },
  ],

  python: [
    {
      repo: REPO_URLS.ruff,
      rev: REPO_VERSIONS.ruff,
      hooks: [
        { id: "ruff", args: ["--fix"] },
        { id: "ruff-format" },
      ],
    },
    {
      repo: REPO_URLS.pyrefly,
      rev: REPO_VERSIONS.pyrefly,
      hooks: [{ id: "pyrefly-check", pass_filenames: false, language: "system" }],
    },
  ],

  go: [
    {
      repo: REPO_URLS.golangciLint,
      rev: REPO_VERSIONS.golangciLint,
      hooks: [{ id: "golangci-lint" }],
    },
    {
      repo: "local",
      rev: "",
      hooks: [
        {
          id: "go-fmt",
          files: "\\.go$",
        },
      ],
    },
  ],

  swift: [
    {
      repo: REPO_URLS.swiftformat,
      rev: REPO_VERSIONS.swiftformat,
      hooks: [{ id: "swiftformat" }],
    },
    {
      repo: REPO_URLS.swiftlint,
      rev: REPO_VERSIONS.swiftlint,
      hooks: [{ id: "swiftlint" }],
    },
  ],

  kotlin: [
    {
      repo: REPO_URLS.ktlint,
      rev: REPO_VERSIONS.ktlint,
      hooks: [{ id: "ktlint" }],
    },
  ],

  java: [
    {
      repo: REPO_URLS.googleJavaFormat,
      rev: REPO_VERSIONS.googleJavaFormat,
      hooks: [{ id: "google-java-format" }],
    },
  ],

  ruby: [
    {
      repo: REPO_URLS.rubocop,
      rev: REPO_VERSIONS.rubocop,
      hooks: [{ id: "rubocop" }],
    },
  ],

  php: [
    {
      repo: REPO_URLS.phpCsFixer,
      rev: REPO_VERSIONS.phpCsFixer,
      hooks: [{ id: "php-cs-fixer" }],
    },
  ],
};

/**
 * Get hooks for a specific language
 * @param language - The language to get hooks for
 * @returns Array of PreCommitRepo configurations for the language
 */
export function getHooksForLanguage(language: SupportedLanguage): PreCommitRepo[] {
  return LANGUAGE_HOOKS[language] ?? [];
}

/**
 * Generate pre-commit configuration for detected languages
 *
 * @param languages - Array of detected languages
 * @returns YAML string containing the pre-commit configuration
 */
export function generatePreCommitConfig(languages: DetectedLanguage[]): string {
  const repos: PreCommitRepo[] = [];
  const addedRepos = new Set<string>();

  // Always include base hooks first
  const baseHooks = getBaseHooks();
  repos.push(baseHooks);
  addedRepos.add(baseHooks.repo);

  // Add language-specific hooks (de-duplicated by repo URL)
  for (const langInfo of languages) {
    const languageHooks = getHooksForLanguage(langInfo.language);

    for (const repo of languageHooks) {
      // Skip if repo already added (de-duplicate)
      if (addedRepos.has(repo.repo)) {
        continue;
      }

      // Skip local repos with empty rev (placeholder for local hooks)
      if (repo.repo === "local" && repo.rev === "") {
        continue;
      }

      repos.push(repo);
      addedRepos.add(repo.repo);
    }
  }

  const config: PreCommitConfig = { repos };

  // Convert to YAML with proper formatting
  return yaml.stringify(config, {
    indent: 2,
    lineWidth: 120,
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  });
}
