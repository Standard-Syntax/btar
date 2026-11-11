import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { generateCircleCiConfig } from "./init-ci.js";

describe("generateCircleCiConfig", () => {
  it("generates parseable CircleCI config with a Python 3.14 executor", () => {
    const source = generateCircleCiConfig(80);
    const config = yaml.parse(source);
    expect(config.version).toBe(2.1);
    expect(config.jobs.analyze.docker[0].image).toBe("cimg/python:3.14-node");
    expect(config.jobs.analyze.steps).toContain("checkout");
    expect(source).toContain("--fail-under 80 > btar-report.json");
    expect(source).toContain("store_artifacts:");
    expect(source).not.toContain("actions/checkout");
  });

  it("rejects invalid score thresholds", () => {
    for (const threshold of [-1, 101, 1.5, NaN]) {
      expect(() => generateCircleCiConfig(threshold)).toThrow();
    }
  });
});
