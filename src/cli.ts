#!/usr/bin/env node
/**
 * BTAR CLI entry point
 */

import { Command } from "commander";
import { VERSION } from "./index.js";
import { analyzeCommand } from "./commands/analyze.js";
import { initCiCommand } from "./commands/init-ci.js";
import { contextCommand } from "./commands/context.js";
import { fixCommand } from "./commands/fix.js";

const program = new Command();

program
  .name("btar")
  .description("Transform brownfield codebases into agent-ready environments")
  .version(VERSION);

program
  .command("analyze <directory>")
  .description("Analyze codebase for agent-readiness")
  .option("-q, --quiet", "Suppress progress output")
  .option("-c, --config <path>", "Path to config file")
  .option("-j, --json", "Output results as JSON")
  .option(
    "--fail-under <score>",
    "Exit non-zero if score below threshold",
    parseInt
  )
  .option("--ratchet", "Enforce no regression from .btar-score baseline")
  .option("--save-baseline", "Save current score as new baseline")
  .action(async (directory, options) => {
    await analyzeCommand(directory, options);
  });

program
  .command("init-ci")
  .description("Generate CircleCI configuration for BTAR")
  .option("-t, --threshold <score>", "Minimum score threshold", "70")
  .option("-f, --force", "Overwrite existing workflow")
  .action(async (options) => {
    await initCiCommand({
      threshold: parseInt(options.threshold, 10),
      force: options.force,
    });
  });

program.addCommand(contextCommand);

program
  .command("fix <directory>")
  .description("Auto-fix lint issues in the codebase")
  .option("-q, --quiet", "Suppress progress output")
  .option("-l, --language <lang>", "Fix only specific language")
  .action(async (directory, options) => {
    await fixCommand(directory, options);
  });

program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});

export { program };
