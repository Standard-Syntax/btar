/**
 * AGENTS.md Validation and Generation Tests
 *
 * TDD: RED phase - these tests define expected behavior
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  validateAgentsMd,
  generateAgentsMd,
  type AgentsMdValidation,
  type AgentsMdOptions,
} from "./agents-md.js";
import type { DetectedLanguage } from "../types.js";

describe("validateAgentsMd", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "btar-agents-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("when file does not exist", () => {
    it("returns exists: false with file not found issue", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(false);
      expect(result.issues).toContain("File not found");
      expect(result.sections).toEqual([]);
    });
  });

  describe("when file exists but is empty", () => {
    it("returns exists: true with empty file issue", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      await fs.writeFile(filePath, "");

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toContain("Empty file");
      expect(result.sections).toEqual([]);
    });
  });

  describe("when file is missing recommended sections", () => {
    it("reports missing Build commands section", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Testing
Run \`npm test\` to execute tests.

## Code Style
Follow ESLint rules.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toContainEqual(
        expect.stringMatching(/missing recommended.*build/i)
      );
      expect(result.sections).toContain("Testing");
      expect(result.sections).toContain("Code Style");
    });

    it("reports missing Test commands section", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Build
Run \`npm run build\` to compile.

## Code Style
Follow ESLint rules.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toContainEqual(
        expect.stringMatching(/missing recommended.*test/i)
      );
    });

    it("reports missing Code style section", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Build
Run \`npm run build\` to compile.

## Testing
Run \`npm test\` to execute tests.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toContainEqual(
        expect.stringMatching(/missing recommended.*style|conventions|formatting/i)
      );
    });
  });

  describe("when file has all recommended sections", () => {
    it("returns empty issues array", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Build
Run \`npm run build\` to compile.

## Testing
Run \`npm test\` to execute tests.

## Code Style
Follow ESLint rules.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toEqual([]);
      expect(result.sections).toContain("Build");
      expect(result.sections).toContain("Testing");
      expect(result.sections).toContain("Code Style");
    });

    it("recognizes alternative section names", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Building
Instructions here.

## Tests
Instructions here.

## Conventions
Instructions here.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toEqual([]);
    });

    it("recognizes Setup as alternative to Build", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# My Project

## Setup
Instructions here.

## Testing
Instructions here.

## Formatting
Instructions here.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.exists).toBe(true);
      expect(result.issues).toEqual([]);
    });
  });

  describe("section detection", () => {
    it("extracts all markdown headings", async () => {
      const filePath = path.join(tempDir, "AGENTS.md");
      const content = `# Project Name

## Overview
Some overview.

## Build
Build instructions.

### Subsection
Details.

## Testing
Test instructions.

## Deployment
Deploy info.
`;
      await fs.writeFile(filePath, content);

      const result = await validateAgentsMd(filePath);

      expect(result.sections).toContain("Overview");
      expect(result.sections).toContain("Build");
      expect(result.sections).toContain("Subsection");
      expect(result.sections).toContain("Testing");
      expect(result.sections).toContain("Deployment");
    });
  });
});

describe("generateAgentsMd", () => {
  describe("with TypeScript project", () => {
    it("generates markdown with TypeScript-specific content", () => {
      const options: AgentsMdOptions = {
        projectName: "my-ts-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("my-ts-project");
      expect(result).toMatch(/typescript/i);
      expect(result).toMatch(/npm|tsc/i);
    });

    it("includes npm test reference", () => {
      const options: AgentsMdOptions = {
        projectName: "my-ts-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
      };

      const result = generateAgentsMd(options);

      expect(result).toMatch(/npm.*test|vitest|jest/i);
    });
  });

  describe("with Python project", () => {
    it("generates markdown with Python-specific content", () => {
      const options: AgentsMdOptions = {
        projectName: "my-python-project",
        languages: [
          { language: "python", confidence: "high", markers: ["pyproject.toml"] },
        ],
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("my-python-project");
      expect(result).toMatch(/python/i);
      expect(result).toContain("uv sync --python 3.14");
      expect(result).toContain("slipcover");
      expect(result).toContain("Pyrefly");
    });
  });

  describe("with multi-language project", () => {
    it("includes sections for each language", () => {
      const options: AgentsMdOptions = {
        projectName: "multi-lang",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
          { language: "python", confidence: "high", markers: ["pyproject.toml"] },
        ],
      };

      const result = generateAgentsMd(options);

      expect(result).toMatch(/typescript/i);
      expect(result).toMatch(/python/i);
    });
  });

  describe("with custom commands", () => {
    it("uses provided build command over defaults", () => {
      const options: AgentsMdOptions = {
        projectName: "custom-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
        buildCommand: "make build",
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("make build");
    });

    it("uses provided test command over defaults", () => {
      const options: AgentsMdOptions = {
        projectName: "custom-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
        testCommand: "make test",
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("make test");
    });

    it("uses provided lint command over defaults", () => {
      const options: AgentsMdOptions = {
        projectName: "custom-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
        lintCommand: "make lint",
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("make lint");
    });
  });

  describe("output constraints", () => {
    it("produces output under 150 lines", () => {
      const options: AgentsMdOptions = {
        projectName: "test-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
          { language: "python", confidence: "high", markers: ["pyproject.toml"] },
          { language: "go", confidence: "high", markers: ["go.mod"] },
        ],
      };

      const result = generateAgentsMd(options);
      const lineCount = result.split("\n").length;

      expect(lineCount).toBeLessThan(150);
    });

    it("produces valid markdown", () => {
      const options: AgentsMdOptions = {
        projectName: "test-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
      };

      const result = generateAgentsMd(options);

      // Should start with a heading
      expect(result).toMatch(/^#/);
      // Should have proper heading structure
      expect(result).toMatch(/##/);
    });

    it("includes all recommended sections", () => {
      const options: AgentsMdOptions = {
        projectName: "test-project",
        languages: [
          { language: "typescript", confidence: "high", markers: ["tsconfig.json"] },
        ],
      };

      const result = generateAgentsMd(options);

      // Should have build section
      expect(result).toMatch(/##.*build/i);
      // Should have test section
      expect(result).toMatch(/##.*test/i);
      // Should have style/conventions section
      expect(result).toMatch(/##.*(style|conventions|formatting)/i);
    });
  });

  describe("with Go project", () => {
    it("generates markdown with Go-specific content", () => {
      const options: AgentsMdOptions = {
        projectName: "my-go-project",
        languages: [
          { language: "go", confidence: "high", markers: ["go.mod"] },
        ],
      };

      const result = generateAgentsMd(options);

      expect(result).toContain("my-go-project");
      expect(result).toMatch(/go/i);
      expect(result).toMatch(/go build|go test|go fmt/i);
    });
  });
});
