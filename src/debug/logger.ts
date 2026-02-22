export interface DebugLogger {
  debug(message: string): Promise<void>;
}

interface CreateDebugLoggerOptions {
  enabled: boolean;
  logFilePath?: string;
  writeStderr?: (line: string) => void;
}

export function createDebugLogger(options: CreateDebugLoggerOptions): DebugLogger {
  const writeStderr = options.writeStderr ?? ((line: string) => console.error(line));

  return {
    async debug(message: string): Promise<void> {
      if (!options.enabled) return;
      const line = `[DEBUG] ${new Date().toISOString()} ${message}`;
      writeStderr(line);
      if (options.logFilePath) {
        await Deno.writeTextFile(options.logFilePath, `${line}\n`, { append: true });
      }
    },
  };
}
