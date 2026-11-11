import { describe, expect, it } from "vitest";
import { generatePythonToolchainConfig } from "./python-toolchain.js";

describe("generatePythonToolchainConfig", () => {
  it("uses a non-packaging Python 3.14 Hatch environment", () => {
    const config = generatePythonToolchainConfig();
    const parsed = Bun.TOML.parse(config) as { tool: { hatch: { envs: { default: { dependencies: string[] } } } } };
    const dependencies = parsed.tool.hatch.envs.default.dependencies;
    expect(dependencies).toEqual(expect.arrayContaining([
      expect.stringMatching(/^ruff[>=]/), expect.stringMatching(/^pyrefly[>=]/),
      expect.stringMatching(/^pytest[>=]/), expect.stringMatching(/^pytest-cov[>=]/),
      expect.stringMatching(/^hypothesis[>=]/), expect.stringMatching(/^semgrep[>=]/),
      expect.stringMatching(/^diff-cover[>=]/),
    ]));
    expect(dependencies.some((dependency: string) => /^gitleaks[>=]/.test(dependency))).toBe(false);
    expect(config).toContain('requires-python = ">=3.14"');
    expect(config).toContain("skip-install = true");
    for (const tool of ["ruff", "pyrefly", "pytest", "hypothesis", "semgrep", "diff-cover"]) {
      expect(config).toContain(tool);
    }
  });
});
