/**
 * Context Command
 * Provides subcommands for context file validation and generation
 */

import { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, basename, join, relative, sep } from "node:path";
import { loadConfig } from "../core/config.js";
import { detectLanguages } from "../core/detector.js";
import {
  validateAgentsMd,
  generateAgentsMd,
} from "../core/context/agents-md.js";
import { inspectRepository } from "../core/context/repository-context.js";
import { writeAgentsFile } from "../core/context/agents-file.js";
import { generatePreCommitConfig } from "../core/context/pre-commit.js";
import { generatePythonToolchainConfig } from "../core/context/python-toolchain.js";
import {
  generateClaudeHooks,
  formatAsSettingsJson,
} from "../core/context/claude-hooks.js";

/**
 * Context command with validate and generate subcommands
 */
export const contextCommand = new Command("context")
  .description("Validate and generate context files for AI coding agents");

/**
 * Validate AGENTS.md file
 */
contextCommand
  .command("validate [path]")
  .description("Validate an AGENTS.md file")
  .action(async (path?: string) => {
    const filePath = resolve(path ?? "./AGENTS.md");

    const result = await validateAgentsMd(filePath);

    if (!result.exists) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }

    if (result.issues.length === 0) {
      console.log("Valid AGENTS.md file");
      console.log(`Sections found: ${result.sections.join(", ")}`);
      return;
    }

    console.log("Issues found:");
    for (const issue of result.issues) {
      console.log(`  - ${issue}`);
    }
    process.exit(1);
  });

/**
 * Generate subcommand group
 */
const generateCommand = new Command("generate").description(
  "Generate context files"
);

/**
 * Generate AGENTS.md
 */
generateCommand
  .command("agents-md [directory]")
  .description("Generate AGENTS.md for a project")
  .option("-o, --output <path>", "Output file path (default: AGENTS.md)")
  .option("-f, --force", "Overwrite existing file")
  .option("--update", "Update the BTAR managed block")
  .option("--build-command <command>", "Use an explicit build command")
  .option("--test-command <command>", "Use an explicit test command")
  .option("--lint-command <command>", "Use an explicit lint command")
  .option("--baseline-report <path>", "Include a saved btar analyze --json report")
  .action(async (directory?: string, options?: { output?: string; force?: boolean; update?: boolean; buildCommand?: string; testCommand?: string; lintCommand?: string; baselineReport?: string }) => {
    const dir = resolve(directory ?? ".");
    const outputPath = resolve(options?.output ?? join(dir, "AGENTS.md"));

    if (options?.force && options.update) {
      console.error("--force and --update cannot be combined");
      process.exitCode = 1;
      return;
    }

    // Check if output exists and force not set
    if (existsSync(outputPath) && !options?.force && !options?.update) {
      console.error(`File already exists: ${outputPath}`);
      console.error("Use --force to overwrite");
      process.exit(1);
    }

    // Load config and detect languages
    const config = await loadConfig(dir);
    const languages = await detectLanguages(dir, config);

    if (languages.length === 0) {
      console.error("No supported languages detected");
      process.exit(1);
    }

    // Generate AGENTS.md
    const projectName = basename(dir);
    try {
      const context = await inspectRepository(dir, languages, options?.baselineReport, config.exclude);
      const repositoryRoot = relative(dirname(outputPath), dir).split(sep).join("/") || ".";
      const content = generateAgentsMd({ projectName, languages, context, repositoryRoot, buildCommand: options?.buildCommand, testCommand: options?.testCommand, lintCommand: options?.lintCommand });
      writeAgentsFile({ path: outputPath, generated: content, mode: options?.update ? "update" : options?.force ? "replace" : "create" });
    } catch (error) {
      console.error(`Cannot generate AGENTS.md: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }

    console.log(`Generated: ${outputPath}`);
    console.log(`Languages: ${languages.map((l) => l.language).join(", ")}`);
  });

/**
 * Generate .pre-commit-config.yaml
 */
generateCommand
  .command("pre-commit [directory]")
  .description("Generate .pre-commit-config.yaml for a project")
  .option(
    "-o, --output <path>",
    "Output file path (default: .pre-commit-config.yaml)"
  )
  .option("-f, --force", "Overwrite existing file")
  .action(async (directory?: string, options?: { output?: string; force?: boolean }) => {
    const dir = resolve(directory ?? ".");
    const outputPath = resolve(options?.output ?? join(dir, ".pre-commit-config.yaml"));

    // Check if output exists and force not set
    if (existsSync(outputPath) && !options?.force) {
      console.error(`File already exists: ${outputPath}`);
      console.error("Use --force to overwrite");
      process.exit(1);
    }

    // Load config and detect languages
    const config = await loadConfig(dir);
    const languages = await detectLanguages(dir, config);

    if (languages.length === 0) {
      console.error("No supported languages detected");
      process.exit(1);
    }

    // Generate pre-commit config
    const content = generatePreCommitConfig(languages);

    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    writeFileSync(outputPath, content, "utf-8");
    console.log(`Generated: ${outputPath}`);
    console.log(`Languages: ${languages.map((l) => l.language).join(", ")}`);
  });

/**
 * Generate Claude Code hooks (.claude/settings.json)
 */
generateCommand
  .command("hooks [directory]")
  .description("Generate Claude Code hooks configuration")
  .option(
    "-o, --output <path>",
    "Output file path (default: .claude/settings.json)"
  )
  .option("-f, --force", "Overwrite existing file")
  .option("--no-pre", "Disable pre-tool hooks")
  .option("--no-post", "Disable post-tool hooks")
  .action(
    async (
      directory?: string,
      options?: {
        output?: string;
        force?: boolean;
        pre?: boolean;
        post?: boolean;
      }
    ) => {
      const dir = resolve(directory ?? ".");
      const outputPath = resolve(options?.output ?? join(dir, ".claude/settings.json"));

      // Check if output exists and force not set
      if (existsSync(outputPath) && !options?.force) {
        console.error(`File already exists: ${outputPath}`);
        console.error("Use --force to overwrite");
        process.exit(1);
      }

      // Generate hooks config - use "." for current directory (more portable)
      const config = generateClaudeHooks({
        projectPath: directory ? dir : ".",
        enablePreCommit: options?.pre !== false,
        enablePostCommit: options?.post !== false,
      });

      const content = formatAsSettingsJson(config);

      // Ensure output directory exists
      const outputDir = dirname(outputPath);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      writeFileSync(outputPath, content, "utf-8");
      console.log(`Generated: ${outputPath}`);

      // Report what hooks were enabled
      const hooks: string[] = [];
      if (options?.pre !== false) hooks.push("PreToolUse");
      if (options?.post !== false) hooks.push("PostToolUse");
      console.log(`Hooks: ${hooks.join(", ")}`);
      if (options?.post !== false) {
        console.log("Post-tool analysis requires consent. Add --trust-project to its command to opt in to executing project code through Hatch.");
      }
    }
  );

generateCommand
  .command("python-toolchain [directory]")
  .description("Generate a Python 3.14 Hatch toolchain configuration")
  .option("-o, --output <path>", "Output file path")
  .option("-f, --force", "Overwrite an existing output file")
  .action(async (directory?: string, options?: { output?: string; force?: boolean }) => {
    const dir = resolve(directory ?? ".");
    const projectFile = join(dir, "pyproject.toml");
    const hasProjectConfiguration = [projectFile, join(dir, "hatch.toml"), join(dir, "setup.py"), join(dir, "setup.cfg")].some(existsSync);
    const defaultOutput = hasProjectConfiguration ? join(dir, "pyproject.btar.toml") : projectFile;
    const outputPath = resolve(options?.output ?? defaultOutput);
    if (existsSync(outputPath) && !options?.force) {
      console.error(`File already exists: ${outputPath}\nUse --force to overwrite.`);
      process.exitCode = 1;
      return;
    }
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, generatePythonToolchainConfig(), "utf-8");
    if (outputPath.endsWith("pyproject.btar.toml")) {
      console.log(`Generated merge candidate: ${outputPath}`);
      console.log("Merge its project metadata, Ruff, pytest, and coverage tables into pyproject.toml, preserving existing settings.");
      console.log("If hatch.toml exists, merge the tool.hatch tables there without the tool.hatch prefix; otherwise merge them into pyproject.toml.");
      return;
    }
    console.log(`Generated: ${outputPath}`);
  });

// Add generate subcommand to context
contextCommand.addCommand(generateCommand);
