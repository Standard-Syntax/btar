import { describe, expect, it } from "vitest";
import { FIX_TOOLS, parseRuffFixOutput } from "./fixer.js";

describe("Ruff remediation", () => {
  it("uses Hatch", () => expect(FIX_TOOLS.python.command).toEqual(["hatch", "run", "ruff", "check", ".", "--fix"]));
  it("reports a failed Ruff invocation", () => expect(parseRuffFixOutput("", "bad config", 2)).toMatchObject({ success: false, tool: "ruff" }));
  it("fails when Ruff fixes some issues but leaves errors", () => {
    expect(parseRuffFixOutput("", "Fixed 2 errors; 1 remaining", 1).success).toBe(false);
  });
});
