/**
 * Tool Runner Utility
 * Subprocess execution for Python project metric tools
 */

import { spawn } from "node:child_process";

/**
 * Result of executing a tool
 */
export interface ToolResult {
  /** Standard output from the tool */
  stdout: string;
  /** Standard error from the tool */
  stderr: string;
  /** Exit code (0 = success, 127 = not found, -1 = timeout) */
  exitCode: number;
  /** Whether the process was killed due to timeout */
  timedOut: boolean;
}

/**
 * Options for running a tool
 */
export interface RunToolOptions {
  /** Command to execute (first element is executable, rest are args) */
  command: string[];
  /** Working directory for execution */
  cwd: string;
  /** Timeout in milliseconds (default: 60000) */
  timeout?: number;
}

/**
 * Execute a tool as a subprocess and capture output
 *
 * @param options - Tool execution options
 * @returns Promise resolving to tool execution result
 *
 * @example
 * ```ts
 * const result = await runTool({
 *   command: ["hatch", "run", "pyrefly", "check"],
 *   cwd: "/path/to/project",
 *   timeout: 30000
 * });
 *
 * if (result.exitCode === 0) {
 *   console.log("Pyrefly check passed");
 * } else {
 *   console.error(result.stderr);
 * }
 * ```
 */
export async function runTool(options: RunToolOptions): Promise<ToolResult> {
  const { command, cwd, timeout = 60000 } = options;

  if (command.length === 0) {
    return {
      stdout: "",
      stderr: "No command provided",
      exitCode: 1,
      timedOut: false,
    };
  }

  const [executable, ...args] = command;

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let childExited = false;

    const child = spawn(executable, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      detached: process.platform !== "win32",
    });

    child.on("exit", () => { childExited = true; });

    const timeoutId = setTimeout(() => {
      if (!childExited && child.pid !== undefined) {
        if (process.platform === "win32") {
          // taskkill is Windows' built-in process-tree termination facility.
          const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
          killer.on("error", () => { child.kill("SIGKILL"); });
          killer.unref();
        } else {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
      }
      child.stdout.destroy();
      child.stderr.destroy();
      resolve({ stdout, stderr, exitCode: -1, timedOut: true });
    }, timeout);

    // Capture stdout
    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    // Capture stderr
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    // Handle process exit
    child.on("close", (code) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
        timedOut: false,
      });
    });

    // Handle spawn errors (e.g., command not found)
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // ENOENT means command not found
      const exitCode = error.code === "ENOENT" ? 127 : 1;

      resolve({
        stdout,
        stderr: error.message,
        exitCode,
        timedOut: false,
      });
    });
  });
}
