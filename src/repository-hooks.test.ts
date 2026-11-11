import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

describe("maintainer safeguards", () => {
  it("retains hygiene, formatting, and Bun checks", () => {
    const config = parse(readFileSync(".pre-commit-config.yaml", "utf8"));
    const hooks = config.repos.flatMap((repo: {hooks:{id:string}[]}) => repo.hooks).map((hook:{id:string}) => hook.id);
    expect(hooks).toEqual(expect.arrayContaining(["trailing-whitespace", "end-of-file-fixer", "check-yaml", "check-added-large-files", "prettier", "typecheck", "lint"]));
    const local = config.repos.find((repo: {repo:string}) => repo.repo === "local");
    expect(local.hooks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "typecheck", entry: "bun run typecheck", language: "system", pass_filenames: false }),
      expect.objectContaining({ id: "lint", entry: "bun run lint", language: "system", pass_filenames: false }),
    ]));
    const prettier = config.repos.flatMap((repo: {hooks:{id:string;files?:string}[]}) => repo.hooks).find((hook:{id:string}) => hook.id === "prettier");
    expect(prettier).toHaveProperty("files");
    expect(prettier.files).toEqual(expect.stringMatching(/\S/));
    expect(new RegExp(prettier.files).test("docs/USER-GUIDE.md")).toBe(true);
  });
  it("runs the typecheck hook for every supported editing operation", () => {
    const config = JSON.parse(readFileSync(".claude/settings.json", "utf8"));
    const entry = config.hooks.PostToolUse[0];
    for (const operation of ["Edit", "MultiEdit", "Write"]) expect(new RegExp(entry.matcher).test(operation)).toBe(true);
    expect(entry.hooks).toContainEqual({type:"command",command:"bun run typecheck"});
  });
});
