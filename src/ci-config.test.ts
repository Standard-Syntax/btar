import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("maintainer CircleCI workflow", () => {
  it("schedules the existing checks and the Python integration", () => {
    const config = parse(readFileSync(".circleci/config.yml", "utf8"));
    expect(config.workflows.verify.jobs).toEqual(expect.arrayContaining(["verify", "python-integration"]));

    const verifySteps = config.jobs.verify.steps;
    expect(verifySteps).toContain("checkout");
    expect(verifySteps.map((step: { run?: { command?: string } }) => step.run?.command)).toEqual(
      expect.arrayContaining([
        ".circleci/install-bun.sh",
        "bun run typecheck",
        "bun run lint",
        "bun run test:coverage",
        "bun dist/cli.js --help",
      ]),
    );
    expect(verifySteps).toContainEqual({ store_artifacts: { path: "coverage" } });

    const pythonSteps = config.jobs["python-integration"].steps;
    expect(pythonSteps).toContain("checkout");
    expect(config.jobs["python-integration"].docker[0].image).toBe("cimg/python:3.14.10");
    expect(pythonSteps.map((step: { run?: { command?: string } }) => step.run?.command)).toEqual(
      expect.arrayContaining([
        ".circleci/install-bun.sh",
        "python -m pip install --user hatch==1.16.5",
        "bun install --frozen-lockfile",
        "bun run verify:python",
      ]),
    );
  });
});
