import fs from "node:fs";
import type { Stats } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { updateManagedBlock } from "./repository-context.js";

type AgentsSnapshot = { kind: "missing" } | { kind: "file"; bytes: Buffer; stat: Stats };

class DestinationChanged extends Error {}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function sameStat(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs && left.mode === right.mode;
}

function snapshot(path: string): AgentsSnapshot {
  const entry = fs.lstatSync(path, { throwIfNoEntry: false });
  if (!entry) return { kind: "missing" };
  if (entry.isSymbolicLink()) throw new Error("Cannot update AGENTS.md through a symbolic link.");
  if (!entry.isFile()) throw new Error("Cannot update AGENTS.md because the destination is not a regular file.");
  let descriptor: number;
  try {
    descriptor = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  } catch (error) {
    if (hasCode(error, "ENOENT")) throw new DestinationChanged();
    if (hasCode(error, "ELOOP")) throw new Error("Cannot update AGENTS.md through a symbolic link.");
    throw error;
  }
  try {
    const stat = fs.fstatSync(descriptor);
    if (!stat.isFile()) throw new Error("Cannot update AGENTS.md because the destination is not a regular file.");
    if (!sameStat(entry, stat)) throw new DestinationChanged();
    const bytes = fs.readFileSync(descriptor);
    if (!sameStat(stat, fs.fstatSync(descriptor))) throw new DestinationChanged();
    const current = fs.lstatSync(path, { throwIfNoEntry: false });
    if (!current || !sameStat(stat, current)) throw new DestinationChanged();
    return { kind: "file", bytes, stat };
  } finally {
    fs.closeSync(descriptor);
  }
}

function sameSnapshot(left: AgentsSnapshot, right: AgentsSnapshot): boolean {
  return left.kind === "missing" ? right.kind === "missing"
    : right.kind === "file" && sameStat(left.stat, right.stat) && left.bytes.equals(right.bytes);
}

export function writeAgentsFile({ path, generated, mode }: { path: string; generated: string; mode: "create" | "replace" | "update" }): void {
  fs.mkdirSync(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const temporary = join(dirname(path), `.${basename(path)}.btar-${randomUUID()}.tmp`);
    let created = false;
    try {
      const original = snapshot(path);
      if (mode === "create" && original.kind === "file") throw new Error("AGENTS.md already exists. Use --force to overwrite.");
      const content = mode === "update" ? updateManagedBlock(original.kind === "file" ? original.bytes : Buffer.alloc(0), generated) : generated;
      const descriptor = fs.openSync(temporary, "wx", 0o600);
      created = true;
      try {
        fs.writeFileSync(descriptor, content);
        fs.fchmodSync(descriptor, original.kind === "file" ? original.stat.mode & 0o777 : 0o666 & ~process.umask());
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (!sameSnapshot(original, snapshot(path))) continue;
      if (original.kind === "missing") {
        try {
          fs.linkSync(temporary, path);
        } catch (error) {
          if (hasCode(error, "EEXIST")) continue;
          throw error;
        }
      } else {
        // Rename is atomic, but the preceding comparison is not a filesystem compare-and-swap.
        fs.renameSync(temporary, path);
        created = false;
      }
      return;
    } catch (error) {
      if (!(error instanceof DestinationChanged)) throw error;
    } finally {
      if (created) fs.unlinkSync(temporary);
    }
  }
  throw new Error("AGENTS.md changed repeatedly during update; retry when other writers have finished.");
}
