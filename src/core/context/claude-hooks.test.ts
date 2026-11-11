import { describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { generateClaudeHooks, formatAsSettingsJson } from "./claude-hooks.js";

describe("Python Claude hooks", () => {
  it("generates Hatch checks and local btar analysis", () => {
    const config = generateClaudeHooks({ projectPath: "." });
    expect(config.hooks.PreToolUse?.[0].hooks[0].command).toBe("cd -- '.' && hatch run pyrefly check");
    expect(config.hooks.PostToolUse?.[0].hooks[0].command).toBe("btar analyze '.' --json");
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
      expect(readFileSync(join(directory, "args.txt"), "utf8").split("\n")).toEqual(["analyze", target, "--json", ""]);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});

it("covers independent hook options, schema, and formatting", () => {
  const preOnly = generateClaudeHooks({ projectPath: "a b", enablePostCommit: false });
  expect(preOnly).toEqual({ hooks: { PreToolUse: [{ matcher: "Edit|MultiEdit|Write", hooks: [{ type: "command", command: "cd -- 'a b' && hatch run pyrefly check" }] }] } });
  const postOnly = generateClaudeHooks({ projectPath: ".", enablePreCommit: false, customCommands: ["first", "second"] });
  expect(postOnly.hooks.PostToolUse).toEqual([{ matcher: "Edit|MultiEdit|Write", hooks: [{ type: "command", command: "btar analyze '.' --json" }, { type: "command", command: "first" }, { type: "command", command: "second" }] }]);
  expect(generateClaudeHooks({ projectPath: ".", enablePreCommit: false, enablePostCommit: false })).toEqual({ hooks: {} });
  expect(formatAsSettingsJson(preOnly)).toBe(JSON.stringify(preOnly, null, 2));
});

it("does not execute Hatch through the generated post-edit hook without consent", () => {
  const root = mkdtempSync(join(tmpdir(), "btar-consent-hook-"));
  try {
    writeFileSync(join(root, "pyproject.toml"), '[build-system]\nrequires = ["hatchling"]\nbuild-backend = "hatchling.build"\n');
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nprintf invoked > invoked\n', { mode: 0o755 });
    writeFileSync(join(root, "btar"), `#!/bin/sh\nexec '${process.execPath}' '${resolve("src/cli.ts")}' "$@"\n`, { mode: 0o755 });
    const command = generateClaudeHooks({ projectPath: root }).hooks.PostToolUse![0].hooks[0].command;
    const result = spawnSync("/bin/sh", ["-c", command], { cwd: root, env: { ...process.env, PATH: root }, encoding: "utf8" });
    expect(result.status).not.toBe(0);
    expect(result.stdout + result.stderr).toContain("--trust-project");
    expect(existsSync(join(root, "invoked"))).toBe(false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("passes a quoted project path literally to the Hatch hook", () => {
  const root = mkdtempSync(join(tmpdir(), "btar-pre-hook-"));
  const target = join(root, "project '$(touch injected)`touch injected`");
  try {
    mkdirSync(target);
    writeFileSync(join(root, "hatch"), '#!/bin/sh\nprintf "%s\\n" "$@" > args.txt\n', { mode: 0o755 });
    const command = generateClaudeHooks({ projectPath: target }).hooks.PreToolUse![0].hooks[0].command;
    const result = spawnSync("/bin/sh", ["-c", command], { cwd: root, env: { ...process.env, PATH: root } });
    expect(result.status).toBe(0);
    expect(readFileSync(join(target, "args.txt"), "utf8").split("\n")).toEqual(["run", "pyrefly", "check", ""]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
