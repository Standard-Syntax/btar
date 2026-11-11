import { Box, Text, render, type Instance } from "ink";

export interface ProgressReporter {
  start(message: string): void;
  success(message: string): void;
  error(message: string): void;
  info(message: string): void;
  metric(name: string, tool: string, value: number | string, success: boolean): void;
  section(title: string): void;
  summary(label: string, value: string | number): void;
  finish(): Promise<void>;
}

export const SYMBOLS = {
  success: "✓", error: "✗", progress: "→", info: "•", branch: "├─", corner: "└─",
} as const;

export interface ProgressOptions {
  quiet?: boolean;
}

interface Line { text: string; tone: "plain" | "success" | "error" | "heading" }

function Transcript({ lines }: { lines: Line[] }): React.JSX.Element {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">btar · Python readiness</Text>
      {lines.map((line, index) => (
        <Text key={index} bold={line.tone === "heading"}
          color={line.tone === "success" ? "green" : line.tone === "error" ? "red" : undefined}>
          {line.text}
        </Text>
      ))}
    </Box>
  );
}

export function createProgressReporter(options: ProgressOptions = {}): ProgressReporter {
  const lines: Line[] = [];
  let instance: Instance | undefined;
  const append = (text: string, tone: Line["tone"] = "plain"): void => {
    if (options.quiet) return;
    lines.push({ text, tone });
    const view = <Transcript lines={[...lines]} />;
    if (instance) instance.rerender(view);
    else instance = render(view, { patchConsole: false, exitOnCtrlC: true });
  };

  return {
    start: (message): void => append(`${SYMBOLS.progress} ${message}`),
    success: (message): void => append(`${SYMBOLS.success} ${message}`, "success"),
    error(message): void {
      process.stderr.write(`${SYMBOLS.error} ${message}\n`);
      append(`${SYMBOLS.error} ${message}`, "error");
    },
    info: (message): void => append(`${SYMBOLS.info} ${message}`),
    metric(name, tool, value, success): void {
      append(`  ${name}: ${value} (${tool}${success ? "" : " failed"})`, success ? "plain" : "error");
    },
    section: (title): void => append(title, "heading"),
    summary: (label, value): void => append(`  ${label}: ${value}`),
    async finish(): Promise<void> {
      if (!instance) return;
      await instance.waitUntilRenderFlush();
      instance.unmount();
      await instance.waitUntilExit();
      instance.cleanup();
      instance = undefined;
    },
  };
}
