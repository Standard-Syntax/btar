import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { writeAgentsFile } from "./agents-file.js";

const roots: string[] = [];
const generated = "<!-- BTAR:START -->\nNew generated instructions\n<!-- BTAR:END -->\n";
function destination(): string {
  const root = fs.mkdtempSync(join(tmpdir(), "btar-agents-file-"));
  roots.push(root);
  return join(root, "AGENTS.md");
}
afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("AGENTS.md update persistence", () => {
  it.each([false, true])("rejects a symlink through the CLI, dangling=%s", (dangling) => {
    const path = destination();
    const target = join(path, "..", "external.md");
    if (!dangling) fs.writeFileSync(target, "External instructions\n");
    fs.symlinkSync(target, path);
    fs.writeFileSync(join(path, "..", "example.py"), "answer = 42\n");
    const bun = Bun.which("bun");
    if (!bun) throw new Error("Bun is required for CLI verification");
    const result = spawnSync(bun, [resolve("src/cli.ts"), "context", "generate", "agents-md", join(path, ".."), "--update"], { encoding: "utf8", timeout: 20_000 });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/symbolic link/i);
    expect(fs.lstatSync(path).isSymbolicLink()).toBe(true);
    if (dangling) expect(fs.existsSync(target)).toBe(false);
    else expect(fs.readFileSync(target, "utf8")).toBe("External instructions\n");
  });

  it("keeps original bytes when a write fails after writing a prefix", () => {
    const path = destination();
    const original = Buffer.from("Human instructions\n");
    fs.writeFileSync(path, original);
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file) => {
      write(file, "partial");
      throw new Error("injected disk full");
    });
    expect(() => writeAgentsFile({ path, generated, mode: "update" })).toThrow("injected disk full");
    expect(fs.readFileSync(path)).toEqual(original);
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it("merges a human edit made while the replacement is being written", () => {
    const path = destination();
    fs.writeFileSync(path, "Old human instructions\n");
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file, data, options) => {
      write(path, "Newest human instructions\n");
      write(file, data, options);
    });
    writeAgentsFile({ path, generated, mode: "update" });
    expect(fs.readFileSync(path, "utf8")).toBe(`Newest human instructions\n${generated}`);
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it.each(["fsyncSync", "renameSync"] as const)("leaves the original intact when %s fails", (operation) => {
    const path = destination();
    fs.writeFileSync(path, "Human instructions\n");
    vi.spyOn(fs, operation).mockImplementationOnce(() => { throw new Error("injected publication failure"); });
    expect(() => writeAgentsFile({ path, generated, mode: "update" })).toThrow("injected publication failure");
    expect(fs.readFileSync(path, "utf8")).toBe("Human instructions\n");
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it("merges a replacement file created while writing", () => {
    const path = destination();
    fs.writeFileSync(path, "Original instructions\n");
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file, data, options) => {
      const replacement = `${path}.replacement`;
      write(replacement, "Replacement instructions\n");
      fs.renameSync(replacement, path);
      write(file, data, options);
    });
    writeAgentsFile({ path, generated, mode: "update" });
    expect(fs.readFileSync(path, "utf8")).toBe(`Replacement instructions\n${generated}`);
  });

  it("rejects a symlink substituted between lstat and open without following it", () => {
    const path = destination();
    const target = `${path}.external`;
    fs.writeFileSync(path, "Original instructions\n");
    fs.writeFileSync(target, "External instructions\n");
    const open = fs.openSync;
    vi.spyOn(fs, "openSync").mockImplementationOnce((file, flags, mode) => {
      fs.unlinkSync(path);
      fs.symlinkSync(target, path);
      return open(file, flags, mode);
    });
    expect(() => writeAgentsFile({ path, generated, mode: "update" })).toThrow(/symbolic link/);
    expect(fs.readFileSync(target, "utf8")).toBe("External instructions\n");
  });

  it("merges a file that appears at exclusive publication", () => {
    const path = destination();
    const link = fs.linkSync;
    vi.spyOn(fs, "linkSync").mockImplementationOnce((source, target) => {
      fs.writeFileSync(path, "Concurrent instructions\n");
      link(source, target);
    });
    writeAgentsFile({ path, generated, mode: "update" });
    expect(fs.readFileSync(path, "utf8")).toBe(`Concurrent instructions\n${generated}`);
  });

  it("stops retrying when a writer continually changes the destination", () => {
    const path = destination();
    fs.writeFileSync(path, "Original instructions\n");
    const write = fs.writeFileSync;
    let edits = 0;
    vi.spyOn(fs, "writeFileSync").mockImplementation((file, data, options) => {
      edits += 1;
      write(path, `Concurrent instructions ${edits}\n`);
      write(file, data, options);
    });
    expect(() => writeAgentsFile({ path, generated, mode: "update" })).toThrow(/changed repeatedly/);
    expect(edits).toBe(3);
    expect(fs.readFileSync(path, "utf8")).toBe("Concurrent instructions 3\n");
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it("publishes complete contents and retains existing permissions", () => {
    const path = destination();
    fs.writeFileSync(path, "Human instructions\n", { mode: 0o640 });
    const rename = fs.renameSync;
    vi.spyOn(fs, "renameSync").mockImplementationOnce((source, target) => {
      expect(fs.readFileSync(path, "utf8")).toBe("Human instructions\n");
      expect(fs.readFileSync(source, "utf8")).toBe(`Human instructions\n${generated}`);
      rename(source, target);
    });
    writeAgentsFile({ path, generated, mode: "update" });
    expect(fs.readFileSync(path, "utf8")).toBe(`Human instructions\n${generated}`);
    expect(fs.statSync(path).mode & 0o777).toBe(0o640);
  });

  it("preserves malformed existing instructions without creating a temporary file", () => {
    const path = destination();
    const original = "Human instructions\n<!-- BTAR:START -->\n";
    fs.writeFileSync(path, original);
    expect(() => writeAgentsFile({ path, generated, mode: "update" })).toThrow(/Malformed/);
    expect(fs.readFileSync(path, "utf8")).toBe(original);
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it("does not overwrite a file created concurrently with ordinary generation", () => {
    const path = destination();
    const link = fs.linkSync;
    vi.spyOn(fs, "linkSync").mockImplementationOnce((source, target) => {
      fs.writeFileSync(path, "Concurrent instructions\n");
      link(source, target);
    });
    expect(() => writeAgentsFile({ path, generated, mode: "create" })).toThrow(/already exists/);
    expect(fs.readFileSync(path, "utf8")).toBe("Concurrent instructions\n");
    expect(fs.readdirSync(join(path, ".."))).toEqual(["AGENTS.md"]);
  });

  it("keeps the original during a failed forced replacement", () => {
    const path = destination();
    fs.writeFileSync(path, "Human instructions\n");
    const write = fs.writeFileSync;
    vi.spyOn(fs, "writeFileSync").mockImplementationOnce((file) => {
      write(file, "partial");
      throw new Error("injected disk full");
    });
    expect(() => writeAgentsFile({ path, generated, mode: "replace" })).toThrow("injected disk full");
    expect(fs.readFileSync(path, "utf8")).toBe("Human instructions\n");
  });
});
