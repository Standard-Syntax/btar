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

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateAgentsMd } from "./agents-md.js";

it.each([
  ["Build", "Testing", "Code Style"],
  ["Building", "Tests", "Conventions"],
  ["Setup", "Tests", "Formatting"],
  ["Installation", "Testing", "Code Style"],
])("accepts documented headings %s / %s / %s", async (build, testing, style) => {
  const root = mkdtempSync(join(tmpdir(), "btar-alias-"));
  const file = join(root, "AGENTS.md");
  try {
    writeFileSync(file, `## ${build}\n## ${testing}\n## ${style}\n`);
    expect((await validateAgentsMd(file)).issues).toEqual([]);
  } finally { rmSync(root, {recursive:true,force:true}); }
});

it("recognizes alternative headings and ignores fenced headings", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-headings-"));
  const file = join(root, "AGENTS.md");
  try {
    writeFileSync(file, "## Setup\n## Tests\n## Conventions\n");
    expect((await validateAgentsMd(file)).issues).toEqual([]);
    writeFileSync(file, "```md\n## Build\n## Testing\n## Code Style\n```\n");
    expect((await validateAgentsMd(file)).issues).toHaveLength(3);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("returns a structured missing-file result when the path cannot be read", async () => {
  const root = mkdtempSync(join(tmpdir(), "btar-unreadable-"));
  try {
    expect(await validateAgentsMd(root)).toEqual({ exists: false, issues: ["File not found"], sections: [] });
    expect(await validateAgentsMd(join(root, "absent"))).toEqual({ exists: false, issues: ["File not found"], sections: [] });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
