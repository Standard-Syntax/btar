import { describe, expect, it } from "vitest";
import { parsePyreflyErrors, TYPE_CHECKER_TOOLS } from "./type-checker.js";

describe("Pyrefly metrics", () => {
  it("uses Hatch and counts only error diagnostics", () => {
    expect(TYPE_CHECKER_TOOLS.python.command).toEqual(["hatch", "run", "pyrefly", "check", "--output-format=json"]);
    expect(parsePyreflyErrors('{"errors":[{"severity":"error"},{"severity":"warning"}]}', "", 1)).toBe(1);
  });
  it("rejects an unsuccessful check without diagnostic evidence", () => {
    expect(parsePyreflyErrors('{"errors":[]}', "", 1)).toBe(-1);
  });
});
