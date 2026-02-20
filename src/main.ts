import { runBackup } from "./commands/backup.ts";
import { runList } from "./commands/list.ts";
import { runRestore } from "./commands/restore.ts";
import { runStatus } from "./commands/status.ts";
import type { RuntimeOptions } from "./types.ts";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], options: RuntimeOptions = {}): Promise<CliResult> {
  if (args.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: "Usage: zen-backup <backup|restore|list|status|install|uninstall> ...",
    };
  }

  let result: { exitCode: number; stdout: string[]; stderr: string[] };

  if (args[0] === "status") {
    result = await runStatus(options);
  } else if (args[0] === "list") {
    result = await runList(options);
  } else if (args[0] === "backup") {
    const kind = args[1];
    if (kind !== "daily" && kind !== "weekly") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Usage: zen-backup backup <daily|weekly>",
      };
    }
    result = await runBackup(kind, options);
  } else if (args[0] === "restore") {
    const archive = args[1];
    if (!archive) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Usage: zen-backup restore <archive>",
      };
    }
    result = await runRestore(archive, options);
  } else {
    result = {
      exitCode: 1,
      stdout: [],
      stderr: [`Command not implemented yet: ${args[0]}`],
    };
  }

  return {
    exitCode: result.exitCode,
    stdout: result.stdout.join("\n"),
    stderr: result.stderr.join("\n"),
  };
}

if (import.meta.main) {
  const result = await runCli(Deno.args);
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout);
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr);
  }
  Deno.exit(result.exitCode);
}
