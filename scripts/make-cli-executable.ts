import { chmod } from "node:fs/promises";
import type { PathLike } from "node:fs";

export async function makeCliExecutable(path: PathLike, platform: NodeJS.Platform = process.platform): Promise<void> {
  if (platform !== "win32") await chmod(path, 0o755);
}

if (import.meta.main) await makeCliExecutable(new URL("../dist/cli.js", import.meta.url));
