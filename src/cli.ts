#!/usr/bin/env bun
/**
 * BTAR CLI entry point
 */

import { Command, InvalidArgumentError } from "commander";
import { VERSION } from "./index.js";
import { analyzeCommand } from "./commands/analyze.js";
import { initCiCommand } from "./commands/init-ci.js";
import { contextCommand } from "./commands/context.js";
import { fixCommand } from "./commands/fix.js";

function percentage(value: string): number {
  const score = Number(value);
  if (!/^\d+$/.test(value) || !Number.isInteger(score) || score < 0 || score > 100) {
    throw new InvalidArgumentError("Expected an integer between 0 and 100");
  }
  return score;
}

const program = new Command();

program
  .name("btar")
  .description("Assess and prepare Python 3.14+ brownfield repositories")
  .version(VERSION);

program
  .command("analyze <directory>")
  .description("Analyze codebase for agent-readiness")
  .option("-q, --quiet", "Suppress progress output")
  .option("-c, --config <path>", "Path to config file")
  .option("-j, --json", "Output results as JSON")
  .option("--trust-project", "Allow project-controlled Hatch configuration and tests to execute with your privileges")
  .option(
    "--fail-under <score>",
    "Exit non-zero if score below threshold",
    percentage
  )
  .option("--ratchet", "Enforce no regression from .btar-score baseline")
  .option("--save-baseline", "Save current score as new baseline")
  .action(async (directory, options) => {
    await analyzeCommand(directory, options);
  });

program
  .command("init-ci [directory]")
  .description("Generate Python quality checks for CircleCI")
  .option("-t, --threshold <percent>", "Minimum changed-line coverage", percentage, 70)
  .option("-f, --force", "Overwrite existing workflow")
  .option("--base-branch <branch>", "Branch for changed-line coverage", "main")
  .action(async (directory: string | undefined, options) => {
    await initCiCommand({
      directory,
      threshold: options.threshold,
      baseBranch: options.baseBranch,
      force: options.force,
    });
  });

program.addCommand(contextCommand);

program
  .command("fix <directory>")
  .description("Auto-fix lint issues in the codebase")
  .option("-q, --quiet", "Suppress progress output")
  .option("-l, --language <lang>", "Fix only specific language")
  .option("--trust-project", "Allow project-controlled Hatch configuration to execute with your privileges")
  .action(async (directory, options) => {
    await fixCommand(directory, options);
  });

const bunVersion = typeof Bun === "undefined" ? null : /^(\d+)\.(\d+)\.(\d+)(?:\+.*)?$/.exec(Bun.version);
const supportedBun = bunVersion !== null && (
  Number(bunVersion[1]) > 1 ||
  (Number(bunVersion[1]) === 1 && (Number(bunVersion[2]) > 4 ||
    (Number(bunVersion[2]) === 4 && Number(bunVersion[3]) >= 4)))
);

if (!supportedBun) {
  console.error("btar requires Bun 1.4.4 or newer. Run bun dist/cli.js or use the Bun-linked btar command.");
  process.exitCode = 1;
} else program.parseAsync(process.argv).catch((error) => {
  console.error("Error:", error.message);
  process.exitCode = 1;
});

export { program };
