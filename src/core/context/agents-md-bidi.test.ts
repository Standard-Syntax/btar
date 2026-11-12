import { describe, expect, it } from "vitest";
import { generateAgentsMd } from "./agents-md.js";
import type { DetectedLanguage } from "../types.js";

const python = (projectPath: string): DetectedLanguage => ({
  language: "python", projectPath, confidence: "high", markers: [], buildSystem: "hatch",
});

describe("generateAgentsMd bidi safety", () => {
  it.each(["\u061c", "\u200e", "\u200f", "\u202a", "\u202b", "\u202c", "\u202d", "\u202e", "\u2066", "\u2067", "\u2068", "\u2069"])("rejects the bidi control U+%s", (control) => {
    expect(() => generateAgentsMd({ projectName: `project${control}name`, languages: [] })).toThrow(/control characters/i);
  });

  it("rejects bidi controls from paths and command overrides", () => {
    expect(() => generateAgentsMd({ projectName: "project", languages: [python(`src\u202e.py`)] })).toThrow(/control characters/i);
    expect(() => generateAgentsMd({ projectName: "project", languages: [], repositoryRoot: `repo\u2066` })).toThrow(/control characters/i);
    expect(() => generateAgentsMd({ projectName: "project", languages: [python(".")], buildCommand: `hatch run\u2067 build` })).toThrow(/control characters/i);
  });
});
