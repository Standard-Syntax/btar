import { describe, expect, it } from "vitest";
import { generatePythonToolchainConfig } from "./python-toolchain.js";

describe("generatePythonToolchainConfig", () => {
  it("uses a non-packaging Python 3.14 Hatch environment", () => {
    const config = generatePythonToolchainConfig();
    expect(config).toContain('requires-python = ">=3.14"');
    expect(config).toContain("skip-install = true");
    for (const tool of ["ruff", "pyrefly", "pytest", "hypothesis", "gitleaks", "semgrep", "diff-cover"]) {
      expect(config).toContain(tool);
    }
  });
});
