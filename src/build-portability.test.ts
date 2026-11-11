import { describe, expect, it } from "vitest";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { makeCliExecutable } from "../scripts/make-cli-executable.js";

describe("CLI executable permissions", () => {
  it("does not invoke chmod for a Windows build", async () => {
    await expect(makeCliExecutable("missing-build-output", "win32")).resolves.toBeUndefined();
  });
  it.skipIf(process.platform === "win32")("sets executable permissions on POSIX", async () => {
    const directory = await mkdtemp(join(tmpdir(), "btar-build-"));
    try {
      const file = join(directory, "cli.js");
      await writeFile(file, "#!/usr/bin/env bun\n", { mode: 0o644 });
      await makeCliExecutable(file);
      expect((await stat(file)).mode & 0o777).toBe(0o755);
    } finally { await rm(directory, {recursive:true,force:true}); }
  });
});
