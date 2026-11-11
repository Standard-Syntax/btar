import { describe, expect, it } from "vitest";
import { LINTER_TOOLS, parseRuffJson } from "./linter.js";

describe("Ruff metrics", () => {
  it("uses Hatch and counts JSON diagnostics", () => {
    expect(LINTER_TOOLS.python.command).toEqual(["hatch", "run", "ruff", "check", ".", "--output-format=json"]);
    expect(parseRuffJson('[{"code":"F401"}]', "", 1)).toBe(1);
  });
  it("rejects unsuccessful checks without JSON", () => expect(parseRuffJson("", "failed", 1)).toBe(-1));
  it.each([
    ["", 0], ["[]", 1], ['[{"code":"F401"}]', 2],
    ['[null]', 0], ['[{}]', 0], ['{}', 0],
  ])("rejects absent, malformed or failed evidence %s %s", (output, status) => {
    expect(parseRuffJson(String(output), "", Number(status))).toBe(-1);
  });
  it("accepts a successful empty report", () => expect(parseRuffJson("[]", "", 0)).toBe(0));
});
