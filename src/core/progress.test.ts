import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";

const reporter = new URL("./progress.tsx", import.meta.url).href;

describe("progress error routing", () => {
  it.each([false, true])("prints an error once with quiet=%s", (quiet) => {
    const script = `const {createProgressReporter}=await import(${JSON.stringify(reporter)}); const progress=createProgressReporter({quiet:${quiet}}); progress.error('btar-error-sentinel'); await progress.finish();`;
    const result = spawnSync(process.execPath, ["-e", script], {
      encoding: "utf8", env: { ...process.env, CI: "true" }, timeout: 10000,
    });
    expect(result.status).toBe(0);
    expect((result.stdout + result.stderr).match(/btar-error-sentinel/g)).toHaveLength(1);
    expect(quiet ? result.stdout : result.stderr).toBe("");
  });
});
