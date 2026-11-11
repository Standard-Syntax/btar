/**
 * Claude Code Hooks Generator Tests
 *
 * Tests for generating valid Claude Code hooks configuration
 */

import { describe, it, expect } from "vitest";
import {
  generateClaudeHooks,
  formatAsSettingsJson,
  type ClaudeHooksConfig,
} from "./claude-hooks.js";

describe("generateClaudeHooks", () => {
  it("uses uv, Python 3.14 and Pyrefly for Python hooks", () => {
    const hooks = generateClaudeHooks({ projectPath: ".", primaryLanguage: "python" });
    expect(hooks.hooks.PreToolUse?.[0].hooks[0].command)
      .toBe("uv run --python 3.14 pyrefly check");
  });

  describe("default options", () => {
    it("produces valid hooks structure with PreToolUse and PostToolUse", () => {
      const config = generateClaudeHooks({ projectPath: "." });

      expect(config).toHaveProperty("hooks");
      expect(config.hooks).toHaveProperty("PreToolUse");
      expect(config.hooks).toHaveProperty("PostToolUse");
    });

    it("PreToolUse includes type checker command", () => {
      const config = generateClaudeHooks({ projectPath: "." });

      expect(config.hooks.PreToolUse).toBeDefined();
      expect(config.hooks.PreToolUse).toHaveLength(1);

      const entry = config.hooks.PreToolUse![0];
      expect(entry.matcher).toBe("Edit|MultiEdit|Write");
      expect(entry.hooks).toHaveLength(1);
      expect(entry.hooks[0].type).toBe("command");
      expect(entry.hooks[0].command).toContain("tsc --noEmit");
    });

    it("PostToolUse includes BTAR analyze command", () => {
      const config = generateClaudeHooks({ projectPath: "." });

      expect(config.hooks.PostToolUse).toBeDefined();
      expect(config.hooks.PostToolUse).toHaveLength(1);

      const entry = config.hooks.PostToolUse![0];
      expect(entry.matcher).toBe("Edit|MultiEdit|Write");
      expect(entry.hooks.length).toBeGreaterThanOrEqual(1);
      expect(entry.hooks[0].type).toBe("command");
      expect(entry.hooks[0].command).toContain("btar analyze");
      expect(entry.hooks[0].command).toContain("--json");
    });
  });

  describe("option: enablePreCommit", () => {
    it("includes PreToolUse when enablePreCommit is true", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePreCommit: true,
      });

      expect(config.hooks.PreToolUse).toBeDefined();
      expect(config.hooks.PreToolUse!.length).toBeGreaterThan(0);
    });

    it("excludes PreToolUse when enablePreCommit is false", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePreCommit: false,
      });

      expect(config.hooks.PreToolUse).toBeUndefined();
    });
  });

  describe("option: enablePostCommit", () => {
    it("includes PostToolUse when enablePostCommit is true", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePostCommit: true,
      });

      expect(config.hooks.PostToolUse).toBeDefined();
      expect(config.hooks.PostToolUse!.length).toBeGreaterThan(0);
    });

    it("excludes PostToolUse when enablePostCommit is false and no custom commands", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePostCommit: false,
        customCommands: [],
      });

      expect(config.hooks.PostToolUse).toBeUndefined();
    });
  });

  describe("option: customCommands", () => {
    it("includes custom commands in PostToolUse hooks", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePostCommit: true,
        customCommands: ["npm run lint", "npm test"],
      });

      expect(config.hooks.PostToolUse).toBeDefined();
      const entry = config.hooks.PostToolUse![0];

      // Should have BTAR analyze + 2 custom commands = 3 hooks
      expect(entry.hooks).toHaveLength(3);
      expect(entry.hooks[1].command).toBe("npm run lint");
      expect(entry.hooks[2].command).toBe("npm test");
    });

    it("creates PostToolUse with only custom commands when enablePostCommit is false", () => {
      const config = generateClaudeHooks({
        projectPath: ".",
        enablePostCommit: false,
        customCommands: ["npm run custom"],
      });

      expect(config.hooks.PostToolUse).toBeDefined();
      const entry = config.hooks.PostToolUse![0];
      expect(entry.hooks).toHaveLength(1);
      expect(entry.hooks[0].command).toBe("npm run custom");
    });
  });

  describe("projectPath handling", () => {
    it("includes projectPath in hook commands", () => {
      const config = generateClaudeHooks({ projectPath: "/my/project" });

      const preEntry = config.hooks.PreToolUse![0];
      expect(preEntry.hooks[0].command).toContain("/my/project");

      const postEntry = config.hooks.PostToolUse![0];
      expect(postEntry.hooks[0].command).toContain("/my/project");
    });

    it("handles projectPath with spaces", () => {
      const config = generateClaudeHooks({ projectPath: "/path with spaces" });

      const preEntry = config.hooks.PreToolUse![0];
      expect(preEntry.hooks[0].command).toContain('"/path with spaces"');
    });
  });

  describe("matcher regex validation", () => {
    it("uses valid regex pattern for file modification tools", () => {
      const config = generateClaudeHooks({ projectPath: "." });

      const preEntry = config.hooks.PreToolUse![0];
      const matcher = preEntry.matcher;

      // Verify it's a valid regex
      expect(() => new RegExp(matcher)).not.toThrow();

      // Verify it matches expected tools
      const regex = new RegExp(matcher);
      expect(regex.test("Edit")).toBe(true);
      expect(regex.test("MultiEdit")).toBe(true);
      expect(regex.test("Write")).toBe(true);

      // Verify it doesn't match other tools
      expect(regex.test("Read")).toBe(false);
      expect(regex.test("Bash")).toBe(false);
    });
  });
});

describe("formatAsSettingsJson", () => {
  it("returns valid JSON string", () => {
    const config = generateClaudeHooks({ projectPath: "." });
    const json = formatAsSettingsJson(config);

    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("uses 2-space indentation", () => {
    const config = generateClaudeHooks({ projectPath: "." });
    const json = formatAsSettingsJson(config);

    // Check for 2-space indentation pattern
    expect(json).toContain("\n  ");
    expect(json).not.toContain("\t");
  });

  it("output matches Claude Code hooks schema", () => {
    const config = generateClaudeHooks({ projectPath: "." });
    const json = formatAsSettingsJson(config);
    const parsed = JSON.parse(json) as ClaudeHooksConfig;

    // Verify schema structure
    expect(parsed).toHaveProperty("hooks");
    expect(parsed.hooks).toHaveProperty("PreToolUse");
    expect(parsed.hooks).toHaveProperty("PostToolUse");

    // Verify PreToolUse structure
    expect(Array.isArray(parsed.hooks.PreToolUse)).toBe(true);
    expect(parsed.hooks.PreToolUse![0]).toHaveProperty("matcher");
    expect(parsed.hooks.PreToolUse![0]).toHaveProperty("hooks");
    expect(Array.isArray(parsed.hooks.PreToolUse![0].hooks)).toBe(true);
    expect(parsed.hooks.PreToolUse![0].hooks[0]).toHaveProperty("type");
    expect(parsed.hooks.PreToolUse![0].hooks[0]).toHaveProperty("command");

    // Verify PostToolUse structure
    expect(Array.isArray(parsed.hooks.PostToolUse)).toBe(true);
    expect(parsed.hooks.PostToolUse![0]).toHaveProperty("matcher");
    expect(parsed.hooks.PostToolUse![0]).toHaveProperty("hooks");
  });

  it("can be parsed back to original config", () => {
    const config = generateClaudeHooks({
      projectPath: ".",
      customCommands: ["npm test"],
    });
    const json = formatAsSettingsJson(config);
    const parsed = JSON.parse(json);

    expect(parsed).toEqual(config);
  });
});

describe("ClaudeHooksConfig schema compliance", () => {
  it("all hooks have type 'command'", () => {
    const config = generateClaudeHooks({
      projectPath: ".",
      customCommands: ["custom1", "custom2"],
    });

    const allHooks = [
      ...(config.hooks.PreToolUse?.[0]?.hooks ?? []),
      ...(config.hooks.PostToolUse?.[0]?.hooks ?? []),
    ];

    for (const hook of allHooks) {
      expect(hook.type).toBe("command");
    }
  });

  it("all hooks have non-empty command strings", () => {
    const config = generateClaudeHooks({
      projectPath: ".",
      customCommands: ["npm run test"],
    });

    const allHooks = [
      ...(config.hooks.PreToolUse?.[0]?.hooks ?? []),
      ...(config.hooks.PostToolUse?.[0]?.hooks ?? []),
    ];

    for (const hook of allHooks) {
      expect(typeof hook.command).toBe("string");
      expect(hook.command.length).toBeGreaterThan(0);
    }
  });

  it("all entries have non-empty matcher strings", () => {
    const config = generateClaudeHooks({ projectPath: "." });

    const allEntries = [
      ...(config.hooks.PreToolUse ?? []),
      ...(config.hooks.PostToolUse ?? []),
    ];

    for (const entry of allEntries) {
      expect(typeof entry.matcher).toBe("string");
      expect(entry.matcher.length).toBeGreaterThan(0);
    }
  });
});
