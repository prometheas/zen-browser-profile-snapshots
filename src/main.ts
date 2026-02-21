import { isHelpFlag, renderHelp } from "./cli/help.ts";
import { parseVersionForDisplay, resolveVersion } from "./cli/version.ts";
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
  const env = options.env ?? Deno.env.toObject();
  const forceColor = env.CLICOLOR_FORCE === "1";
  const color = forceColor || (env.NO_COLOR !== "1" && !Deno.noColor);

  if (args.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: renderHelp("root", { color }),
    };
  }

  if (isHelpFlag(args[0]) || args[0] === "help") {
    return {
      exitCode: 0,
      stdout: renderHelp("root", { color }),
      stderr: "",
    };
  }
  if (args[0] === "-v" || args[0] === "--version" || args[0] === "version") {
    const version = env.ZEN_BACKUP_VERSION?.trim().length
      ? env.ZEN_BACKUP_VERSION.trim()
      : await resolveVersion();
    return {
      exitCode: 0,
      stdout: formatVersionOutput(version, color),
      stderr: "",
    };
  }

  let result: { exitCode: number; stdout: string[]; stderr: string[] };

  if (args[0] === "status") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("status", { color }), stderr: "" };
    }
    result = await runStatus(options);
  } else if (args[0] === "list") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("list", { color }), stderr: "" };
    }
    result = await runList(options);
  } else if (args[0] === "backup") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("backup", { color }), stderr: "" };
    }
    const kind = args[1];
    if (kind !== "daily" && kind !== "weekly") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("backup", { color })}`,
      };
    }
    result = await runBackup(kind, options);
  } else if (args[0] === "restore") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("restore", { color }), stderr: "" };
    }
    const archive = args[1];
    if (!archive) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("restore", { color })}`,
      };
    }
    result = await runRestore(archive, options);
  } else if (args[0] === "install") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("install", { color }), stderr: "" };
    }
    result = await runInstall(options);
  } else if (args[0] === "uninstall") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("uninstall", { color }), stderr: "" };
    }
    const purge = args.includes("--purge-backups");
    result = await runUninstall({
      ...options,
      env: {
        ...env,
        ZEN_BACKUP_PURGE_BACKUPS: purge ? "1" : "0",
      },
    });
  } else if (args[0] === "schedule") {
    if (isHelpFlag(args[1])) {
      return { exitCode: 0, stdout: renderHelp("schedule", { color }), stderr: "" };
    }
    const action = args[1] as "start" | "resume" | "stop" | "pause" | "status" | undefined;
    if (!action || !["start", "resume", "stop", "pause", "status"].includes(action)) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("schedule", { color })}`,
      };
    }
    result = await runSchedule(action, options);
  } else {
    result = {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Unknown command: ${args[0]}`,
        "",
        renderHelp("root", { color }),
      ],
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

function formatVersionOutput(version: string, color: boolean): string {
  const parsed = parseVersionForDisplay(version);
  if (parsed.kind === "production") {
    return parsed.semver;
  }

  if (parsed.kind === "preview" && parsed.channel && parsed.channelIteration) {
    if (!color) return parsed.raw;
    const channelColor = parsed.channel === "alpha" ? "31" : "33";
    let out =
      `${parsed.semver}-\u001b[1;${channelColor}m${parsed.channel}\u001b[0m.${parsed.channelIteration}`;
    if (parsed.aheadCount && parsed.hash) {
      out += `-${parsed.aheadCount}-\u001b[90mg${parsed.hash}\u001b[0m`;
    }
    return out;
  }

  return version;
}
