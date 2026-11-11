import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { generatePreCommitConfig } from "./pre-commit.js";

describe("generatePreCommitConfig", () => {
  it("generates the Python quality and security hooks", () => {
    const config = yaml.parse(generatePreCommitConfig([]));
    const repositories = config.repos.map((repo: { repo: string }) => repo.repo).join(" ");
    expect(repositories).toContain("ruff");
    expect(config.repos.find((repo: { repo: string }) => repo.repo === "local").hooks[0]).toMatchObject({ entry: "hatch run pyrefly check", language: "system", pass_filenames: false });
    expect(repositories).toContain("gitleaks");
    expect(repositories).toContain("semgrep");
    expect(repositories).not.toContain("eslint");
    const hooks = config.repos.flatMap((repo: { hooks: { id: string }[] }) => repo.hooks.map((hook) => hook.id));
    expect(hooks).toEqual(expect.arrayContaining(["ruff-check", "ruff-format", "pyrefly", "gitleaks", "semgrep"]));
  });
});
