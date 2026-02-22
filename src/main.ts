import { isHelpFlag, renderHelp } from "./cli/help.ts";
import { parseGlobalOptions } from "./cli/global-options.ts";
import { parseVersionForDisplay, resolveVersion } from "./cli/version.ts";
import { runRustCli } from "./bridge/rust-cli.ts";
import { runBackup } from "./commands/backup.ts";
import { runFeedback } from "./commands/feedback.ts";
import { runInstall } from "./commands/install.ts";
import { runList } from "./commands/list.ts";
import { runRestore } from "./commands/restore.ts";
import { runSchedule } from "./commands/schedule.ts";
import { runStatus } from "./commands/status.ts";
import { runUninstall } from "./commands/uninstall.ts";
import { createDebugLogger } from "./debug/logger.ts";
import type { RuntimeOptions } from "./types.ts";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], options: RuntimeOptions = {}): Promise<CliResult> {
  const env = options.env ?? Deno.env.toObject();
  if (env.ZEN_BACKUP_USE_RUST_CLI === "1") {
    return await runRustCli(args, options);
  }
  const parsedGlobals = parseGlobalOptions(args);
  const effectiveArgs = parsedGlobals.commandArgs;
  const debugEnabled = parsedGlobals.debugEnabled || parsedGlobals.logFilePath !== undefined;
  const debug = createDebugLogger({
    enabled: debugEnabled,
    logFilePath: parsedGlobals.logFilePath,
  });
  const forceColor = env.CLICOLOR_FORCE === "1";
  const color = forceColor || (env.NO_COLOR !== "1" && !Deno.noColor);
  await debug.debug(`argv=${JSON.stringify(effectiveArgs)}`);

  if (effectiveArgs.length === 0) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: renderHelp("root", { color }),
    };
  }

  if (isHelpFlag(effectiveArgs[0]) || effectiveArgs[0] === "help") {
    return {
      exitCode: 0,
      stdout: renderHelp("root", { color }),
      stderr: "",
    };
  }
  if (
    effectiveArgs[0] === "-v" || effectiveArgs[0] === "--version" || effectiveArgs[0] === "version"
  ) {
    const version = options.version ?? await resolveVersion();
    return {
      exitCode: 0,
      stdout: formatVersionOutput(version, color),
      stderr: "",
    };
  }

  let result: { exitCode: number; stdout: string[]; stderr: string[] };

  if (effectiveArgs[0] === "status") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("status", { color }), stderr: "" };
    }
    result = await runStatus(options);
  } else if (effectiveArgs[0] === "list") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("list", { color }), stderr: "" };
    }
    result = await runList(options);
  } else if (effectiveArgs[0] === "backup") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("backup", { color }), stderr: "" };
    }
    const kind = effectiveArgs[1];
    if (kind !== "daily" && kind !== "weekly") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("backup", { color })}`,
      };
    }
    result = await runBackup(kind, options);
  } else if (effectiveArgs[0] === "restore") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("restore", { color }), stderr: "" };
    }
    const archive = effectiveArgs[1];
    if (!archive) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("restore", { color })}`,
      };
    }
    result = await runRestore(archive, options);
  } else if (effectiveArgs[0] === "install") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("install", { color }), stderr: "" };
    }
    result = await runInstall(options);
  } else if (effectiveArgs[0] === "uninstall") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("uninstall", { color }), stderr: "" };
    }
    const purge = effectiveArgs.includes("--purge-backups");
    result = await runUninstall({
      ...options,
      env: {
        ...env,
        ZEN_BACKUP_PURGE_BACKUPS: purge ? "1" : "0",
      },
    });
  } else if (effectiveArgs[0] === "schedule") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("schedule", { color }), stderr: "" };
    }
    const action = effectiveArgs[1] as
      | "start"
      | "resume"
      | "stop"
      | "pause"
      | "status"
      | undefined;
    if (!action || !["start", "resume", "stop", "pause", "status"].includes(action)) {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `${renderHelp("root", { color })}\n\n${renderHelp("schedule", { color })}`,
      };
    }
    result = await runSchedule(action, options);
  } else if (effectiveArgs[0] === "feedback") {
    if (isHelpFlag(effectiveArgs[1])) {
      return { exitCode: 0, stdout: renderHelp("feedback", { color }), stderr: "" };
    }
    result = await runFeedback(effectiveArgs[1] ?? "", options);
  } else {
    result = {
      exitCode: 1,
      stdout: [],
      stderr: [
        `Unknown command: ${effectiveArgs[0]}`,
        "",
        renderHelp("root", { color }),
      ],
    };
  }

  await debug.debug(`exitCode=${result.exitCode}`);
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
