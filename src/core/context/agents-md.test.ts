import { describe, expect, it } from "vitest";
import { generateAgentsMd } from "./agents-md.js";

describe("generateAgentsMd", () => {
  it("gives a Python 3.14 project its Hatch quality commands", () => {
    const content = generateAgentsMd({ projectName: "sample", languages: [] });
    expect(content).toContain("Python 3.14 or newer");
    expect(content).toContain("hatch run pytest --cov");
    expect(content).toContain("hatch run ruff check .");
    expect(content).toContain("hatch run pyrefly check");
    expect(content).toContain("Hypothesis");
    expect(content).not.toContain("npm");
  });
});
