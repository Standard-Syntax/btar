import { describe, expect, it } from "vitest";
import { COVERAGE_TOOLS, parsePytestCoverageJson } from "./coverage.js";

describe("pytest-cov metrics", () => {
  it("uses pytest-cov through Hatch", () => expect(COVERAGE_TOOLS.python.command).toEqual(["hatch", "run", "pytest", "--cov", "--cov-report=json:coverage.json", "-q"]));
  it("reads the reported percentage", () => expect(parsePytestCoverageJson('{"totals":{"percent_covered":87.5}}', "", 0)).toBe(87.5));
  it("rejects missing or unsuccessful evidence", () => {
    expect(parsePytestCoverageJson("{}", "", 0)).toBe(-1);
    expect(parsePytestCoverageJson('{"totals":{"percent_covered":80}}', "", 1)).toBe(-1);
  });
});
