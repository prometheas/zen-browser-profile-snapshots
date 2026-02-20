import { runBackup } from "./commands/backup.ts";
import { runInstall } from "./commands/install.ts";
import { runList } from "./commands/list.ts";
import { runRestore } from "./commands/restore.ts";
import { runSchedule } from "./commands/schedule.ts";
import { runStatus } from "./commands/status.ts";
import { runUninstall } from "./commands/uninstall.ts";
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
      stderr: "Usage: zen-backup <backup|restore|list|status|install|uninstall|schedule> ...",
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
  } else if (args[0] === "install") {
    result = await runInstall(options);
  } else if (args[0] === "uninstall") {
    const purge = args.includes("--purge-backups");
    result = await runUninstall({
      ...options,
      env: {
        ...(options.env ?? Deno.env.toObject()),
        ZEN_BACKUP_PURGE_BACKUPS: purge ? "1" : "0",
      },
    });
  } else if (args[0] === "schedule") {
    const action = args[1] as "start" | "resume" | "stop" | "pause" | "status" | undefined;
    if (!action || !["start", "resume", "stop", "pause", "status"].includes(action)) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: "Usage: zen-backup schedule <start|stop|pause|resume|status>",
      };
    }
    result = await runSchedule(action, options);
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
