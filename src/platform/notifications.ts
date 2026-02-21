import { join } from "jsr:@std/path@1.1.4";
import type { Platform } from "../types.ts";

export interface NotifyOptions {
  backupRoot: string;
  os: Platform;
  enabled: boolean;
  title: string;
  message: string;
  env?: Record<string, string | undefined>;
}

export async function notify(options: NotifyOptions): Promise<void> {
  if (!options.enabled) return;
  await Deno.mkdir(options.backupRoot, { recursive: true });
  const path = join(options.backupRoot, "notifications.log");
  let backend = "log-only";

  if (options.os === "darwin") {
    backend = await notifyMacos(options);
  }

  const line = `[${
    new Date().toISOString()
  }] ${options.os} (${backend}): ${options.title} :: ${options.message}\n`;
  await Deno.writeTextFile(path, line, { append: true });
}

async function notifyMacos(options: NotifyOptions): Promise<string> {
  const hasTerminalNotifier = await executableExists("terminal-notifier", options.env);
  if (hasTerminalNotifier) {
    const out = await new Deno.Command("terminal-notifier", {
      args: ["-title", options.title, "-message", options.message],
      stdout: "null",
      stderr: "null",
    }).output();
    if (out.success) return "terminal-notifier";
  }

  const script = `display notification "${escapeAppleScript(options.message)}" with title "${
    escapeAppleScript(options.title)
  }"`;
  const fallback = await new Deno.Command("osascript", {
    args: ["-e", script],
    stdout: "null",
    stderr: "null",
  }).output();
  if (fallback.success) return "osascript";

  return hasTerminalNotifier ? "terminal-notifier-failed" : "osascript-failed";
}

function escapeAppleScript(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function executableExists(
  name: string,
  env?: Record<string, string | undefined>,
): Promise<boolean> {
  if (env?.ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER === "1" && name === "terminal-notifier") {
    return false;
  }
  const probe = await new Deno.Command("sh", {
    args: ["-lc", `command -v ${name}`],
    env: env
      ? Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<
        string,
        string
      >
      : undefined,
    stdout: "null",
    stderr: "null",
  }).output();
  return probe.success;
}
