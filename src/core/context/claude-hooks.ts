export interface ClaudeHook { type: "command"; command: string; }
export interface ClaudeHookEntry { matcher: string; hooks: ClaudeHook[]; }
export interface ClaudeHooksConfig { hooks: { PreToolUse?: ClaudeHookEntry[]; PostToolUse?: ClaudeHookEntry[]; }; }
export interface ClaudeHooksOptions {
  projectPath: string;
  enablePreCommit?: boolean;
  enablePostCommit?: boolean;
  customCommands?: string[];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

export function generateClaudeHooks(options: ClaudeHooksOptions): ClaudeHooksConfig {
  const config: ClaudeHooksConfig = { hooks: {} };
  const matcher = "Edit|MultiEdit|Write";
  if (options.enablePreCommit !== false) {
    config.hooks.PreToolUse = [{ matcher, hooks: [{ type: "command",
      command: `cd -- ${shellQuote(options.projectPath)} && hatch run pyrefly check`,
    }] }];
  }
  const hooks: ClaudeHook[] = [];
  if (options.enablePostCommit !== false) {
    hooks.push({ type: "command", command: `btar analyze ${shellQuote(options.projectPath)} --json --trust-project` });
  }
  for (const command of options.customCommands ?? []) hooks.push({ type: "command", command });
  if (hooks.length > 0) config.hooks.PostToolUse = [{ matcher, hooks }];
  return config;
}

export function formatAsSettingsJson(config: ClaudeHooksConfig): string {
  return JSON.stringify(config, null, 2);
}
