import { describe, expect, it } from "vitest";
import * as yaml from "yaml";
import { generateCircleCiConfig } from "./init-ci.js";

describe("generateCircleCiConfig", () => {
  it("generates a Python 3.14 Hatch quality workflow", () => {
    const source = generateCircleCiConfig(80);
    const config = yaml.parse(source);
    expect(config.version).toBe(2.1);
    expect(config.jobs.quality.docker[0].image).toBe("cimg/python:3.14");
    expect(source).toContain("hatch run ruff check .");
    expect(source).toContain("hatch run pyrefly check");
    expect(source).toContain("hatch run pytest --cov");
    expect(source).toContain("hatch run diff-cover coverage.xml --compare-branch=origin/main --fail-under=80");
    expect(source).toContain("git fetch origin +refs/heads/main:refs/remotes/origin/main");
    expect(source).toContain("gitleaks_8.24.2_linux_x64.tar.gz");
    expect(source).toContain("fa0500f6b7e41d28791ebc680f5dd9899cd42b58629218a5f041efa899151a8e");
    expect(source).toContain("/tmp/gitleaks detect --source=. --no-banner");
    expect(source).toContain("semgrep scan --config p/python --error --strict");
    expect(source).not.toContain("npm install");
  });

  it("rejects an invalid changed-line coverage threshold", () => {
    expect(() => generateCircleCiConfig(101)).toThrow();
  });

  it("accepts a project-specific comparison branch", () => {
    expect(generateCircleCiConfig(90, "trunk")).toContain("--compare-branch=origin/trunk --fail-under=90");
  });

  it("rejects branch names that could alter the generated shell command", () => {
    expect(() => generateCircleCiConfig(80, "main; curl evil")).toThrow();
    expect(() => generateCircleCiConfig(80, "$(whoami)")).toThrow();
  });
});
