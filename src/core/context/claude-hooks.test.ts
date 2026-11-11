import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { generateClaudeHooks, formatAsSettingsJson } from "./claude-hooks.js";

describe("Python Claude hooks", () => {
  it("generates Hatch checks and local btar analysis", () => {
    const config = generateClaudeHooks({ projectPath: "." });
    expect(config.hooks.PreToolUse?.[0].hooks[0].command).toBe("cd -- '.' && hatch run pyrefly check");
    expect(config.hooks.PostToolUse?.[0].hooks[0].command).toBe("btar analyze '.' --json --trust-project");
    expect(JSON.parse(formatAsSettingsJson(config))).toEqual(config);
  });
  it("can disable hooks and retain explicit custom commands", () => {
    const config = generateClaudeHooks({ projectPath: ".", enablePreCommit: false, enablePostCommit: false, customCommands: ["hatch run ruff check ."] });
    expect(config.hooks.PreToolUse).toBeUndefined();
    expect(config.hooks.PostToolUse?.[0].hooks).toEqual([{ type: "command", command: "hatch run ruff check ." }]);
  });
  it("passes shell metacharacters literally to the installed CLI", () => {
    const directory = mkdtempSync(join(tmpdir(), "btar-hook-"));
    try {
      const target = "project'$(touch injected)`touch injected`";
      writeFileSync(join(directory, "btar"), '#!/bin/sh\nprintf "%s\\n" "$@" > args.txt\n', { mode: 0o755 });
      const command = generateClaudeHooks({ projectPath: target }).hooks.PostToolUse![0].hooks[0].command;
      const result = spawnSync("/bin/sh", ["-c", command], { cwd: directory, env: { ...process.env, PATH: directory } });
      expect(result.status).toBe(0);
      expect(readFileSync(join(directory, "args.txt"), "utf8").split("\n")).toEqual(["analyze", target, "--json", "--trust-project", ""]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
