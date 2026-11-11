/**
 * Fix Command
 * Auto-fix lint issues across detected languages
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "../core/config.js";
import { detectLanguages } from "../core/detector.js";
import { createProgressReporter } from "../core/progress.js";
import { runFix, type FixResult } from "../core/remediation/fixer.js";

/**
 * Options for fix command
 */
export interface FixOptions {
  quiet?: boolean;
  trustProject?: boolean;
  language?: string;
}

/**
 * Fix lint issues in a directory
 * @param directory - Directory to fix
 * @param options - Command options
 */
export async function fixCommand(
  directory: string,
  options: FixOptions = {}
): Promise<void> {
  const progress = createProgressReporter({ quiet: options.quiet });
  try {
    if (options.trustProject !== true) {
      progress.error("Project execution requires --trust-project. Hatch configuration can execute code with your privileges.");
      process.exitCode = 1;
      return;
    }
    const resolvedDir = resolve(directory);

    // Validate directory exists
    if (!existsSync(resolvedDir) || !statSync(resolvedDir).isDirectory()) {
      progress.error(`Directory not found: ${resolvedDir}`);
      process.exitCode = 1;
      return;
    }

    progress.start(`Fixing lint issues in ${resolvedDir}...`);

    // Load config
    const config = await loadConfig(resolvedDir);

    // Detect languages
    let languages = await detectLanguages(resolvedDir, config);

    if (languages.length === 0) {
      progress.info("No Python code detected");
      return;
    }

    // Filter by specific language if requested
    if (options.language) {
      const targetLang = options.language.toLowerCase();
      languages = languages.filter((l) => l.language === targetLang);

      if (languages.length === 0) {
        progress.error(`Language not detected: ${options.language}`);
        process.exitCode = 1;
      return;
      }
    }

    const languageNames = languages.map((l) => l.language).join(", ");
    progress.success(`Found: ${languageNames}`);

    // Run fix for each language
    const results = new Map<string, FixResult>();
    let hasFailures = false;

    for (const lang of languages) {
      progress.info(`Fixing ${lang.projectPath}...`);

      const result = await runFix(lang.language, resolve(resolvedDir, lang.projectPath));
      results.set(lang.projectPath, result);

      if (result.success) {
        const fileInfo =
          result.filesModified >= 0
            ? ` (${result.filesModified} files)`
            : "";
        progress.success(`${lang.projectPath}: ${result.message}${fileInfo}`);
      } else {
        hasFailures = true;
        progress.error(`${lang.projectPath}: Ruff fix failed. Run Ruff directly in the trusted project for details.`);
      }
    }

    // Summary
    progress.section("Fix Results:");
    const successCount = Array.from(results.values()).filter((r) => r.success)
      .length;
    const totalCount = results.size;

    progress.summary("Projects fixed", `${successCount}/${totalCount}`);

    if (hasFailures) {
      progress.error("Some fix operations failed");
      process.exitCode = 1;
      return;
    }

    progress.success("All fix operations completed successfully");
  } finally {
    await progress.finish();
  }
}
