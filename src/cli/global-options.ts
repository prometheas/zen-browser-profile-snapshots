export interface ParsedGlobalOptions {
  commandArgs: string[];
  debugEnabled: boolean;
  logFilePath?: string;
}

const defaultDebugLogFile = "zen-backup-debug.log";
const knownRootCommands = new Set([
  "backup",
  "restore",
  "list",
  "status",
  "install",
  "uninstall",
  "schedule",
  "feedback",
  "help",
  "version",
  "-h",
  "--help",
  "-v",
  "--version",
]);

export function parseGlobalOptions(args: string[]): ParsedGlobalOptions {
  const commandArgs: string[] = [];
  let debugEnabled = false;
  let logFilePath: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--debug") {
      debugEnabled = true;
      continue;
    }

    if (arg === "--log-file") {
      const next = args[i + 1];
      if (next && !next.startsWith("-") && !knownRootCommands.has(next)) {
        logFilePath = next;
        i += 1;
      } else {
        logFilePath = defaultDebugLogFile;
      }
      continue;
    }

    commandArgs.push(arg);
  }

  return {
    commandArgs,
    debugEnabled,
    logFilePath,
  };
}
