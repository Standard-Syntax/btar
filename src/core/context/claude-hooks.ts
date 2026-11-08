/**
 * Claude Code Hooks Generator
 *
 * Generates .claude/settings.json hooks configuration for BTAR validation.
 * Claude Code hooks enable automated quality checks during AI-assisted development.
 *
 * Hook schema reference:
 * {
 *   "hooks": {
 *     "PreToolUse": [
 *       { "matcher": "Edit|Write", "hooks": [{ "type": "command", "command": "..." }] }
 *     ],
 *     "PostToolUse": [...]
 *   }
 * }
 */

/**
 * A single hook command to execute
 */
export interface ClaudeHook {
  /** Hook type (currently only "command" is supported) */
  type: "command";
  /** Shell command to execute */
  command: string;
}

/**
 * A hook entry with matcher and associated hooks
 */
export interface ClaudeHookEntry {
  /** Regex pattern matching tool names (e.g., "Edit|Write") */
  matcher: string;
  /** Array of hooks to execute when matcher matches */
  hooks: ClaudeHook[];
}

/**
 * Claude Code hooks configuration structure
 */
export interface ClaudeHooksConfig {
  hooks: {
    /** Hooks that run before a tool is used */
    PreToolUse?: ClaudeHookEntry[];
    /** Hooks that run after a tool is used */
    PostToolUse?: ClaudeHookEntry[];
  };
}

/**
 * Options for generating Claude hooks
 */
export interface ClaudeHooksOptions {
  /** Path to the project (used in hook commands) */
  projectPath: string;
  /** Run type/lint checks before file writes (default: true) */
  enablePreCommit?: boolean;
  /** Run BTAR score analysis after file changes (default: true) */
  enablePostCommit?: boolean;
  /** Additional custom commands to run in post hooks */
  customCommands?: string[];
  /** Primary language for language-specific hook commands */
  primaryLanguage?: string;
  /** Build system used by the project */
  buildSystem?: string;
}

/** Default matcher for file modification tools */
const FILE_MODIFICATION_MATCHER = "Edit|MultiEdit|Write";

/**
 * Generate Claude Code hooks configuration for BTAR validation
 *
 * @param options - Configuration options for hook generation
 * @returns ClaudeHooksConfig ready for settings.json
 *
 * @example
 * ```ts
 * const config = generateClaudeHooks({ projectPath: "." });
 * const json = formatAsSettingsJson(config);
 * fs.writeFileSync(".claude/settings.json", json);
 * ```
 */
export function generateClaudeHooks(options: ClaudeHooksOptions): ClaudeHooksConfig {
  const {
    projectPath,
    enablePreCommit = true,
    enablePostCommit = true,
    customCommands = [],
  } = options;

  const config: ClaudeHooksConfig = {
    hooks: {},
  };

  // Use "." for relative paths (more portable)
  const pathArg = projectPath === "." ? "." : projectPath;

  // PreToolUse hooks: Run before file modifications
  if (enablePreCommit) {
    // Select type-check command based on language and build system
    let typeCheckCommand: string;
    if (options.buildSystem === "gradle") {
      typeCheckCommand = "./gradlew compileDebugJavaWithJavac";
    } else if (options.primaryLanguage === "python") {
      typeCheckCommand = "uv run --python 3.14 pyrefly check";
    } else if (options.primaryLanguage === "go") {
      typeCheckCommand = "go vet ./...";
    } else {
      typeCheckCommand = pathArg === "." ? "npx tsc --noEmit" : `npx tsc --noEmit --project "${pathArg}"`;
    }

    const preHooks: ClaudeHook[] = [
      {
        type: "command",
        command: typeCheckCommand,
      },
    ];

    config.hooks.PreToolUse = [
      {
        matcher: FILE_MODIFICATION_MATCHER,
        hooks: preHooks,
      },
    ];
  }

  // PostToolUse hooks: Run after file modifications
  if (enablePostCommit || customCommands.length > 0) {
    const postHooks: ClaudeHook[] = [];

    if (enablePostCommit) {
      postHooks.push({
        type: "command",
        command: pathArg === "." ? "btar analyze . --json" : `btar analyze "${pathArg}" --json`,
      });
    }

    // Add custom commands
    for (const cmd of customCommands) {
      postHooks.push({
        type: "command",
        command: cmd,
      });
    }

    if (postHooks.length > 0) {
      config.hooks.PostToolUse = [
        {
          matcher: FILE_MODIFICATION_MATCHER,
          hooks: postHooks,
        },
      ];
    }
  }

  return config;
}

/**
 * Format Claude hooks config as settings.json content
 *
 * @param config - ClaudeHooksConfig to format
 * @returns JSON string with 2-space indentation
 */
export function formatAsSettingsJson(config: ClaudeHooksConfig): string {
  return JSON.stringify(config, null, 2);
}
