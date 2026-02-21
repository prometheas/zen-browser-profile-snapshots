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
  } else if (options.os === "linux") {
    backend = await notifyLinux(options);
  }

  const line = `[${
    new Date().toISOString()
  }] ${options.os} (${backend}): ${options.title} :: ${options.message}\n`;
  await Deno.writeTextFile(path, line, { append: true });
}

async function notifyMacos(options: NotifyOptions): Promise<string> {
  const hasTerminalNotifier = await executableExists("terminal-notifier", options.env);
  if (hasTerminalNotifier) {
    const out = await runCommandWithTimeout(
      "terminal-notifier",
      ["-title", options.title, "-message", options.message],
      1500,
    );
    if (out.success) return "terminal-notifier";
  }

  if (options.env?.ZEN_BACKUP_FORCE_NO_OSASCRIPT === "1") {
    return "osascript-skipped";
  }

  const script = `display notification "${escapeAppleScript(options.message)}" with title "${
    escapeAppleScript(options.title)
  }"`;
  const fallback = await runCommandWithTimeout("osascript", ["-e", script], 1500);
  if (fallback.success) return "osascript";

  return hasTerminalNotifier ? "terminal-notifier-failed" : "osascript-failed";
}

async function notifyLinux(options: NotifyOptions): Promise<string> {
  const hasNotifySend = await executableExists("notify-send", options.env);
  if (hasNotifySend) {
    const out = await new Deno.Command("notify-send", {
      args: [options.title, options.message],
      stdout: "null",
      stderr: "null",
    }).output();
    if (out.success) return "notify-send";
    await appendNotificationWarning(options.backupRoot, "notify-send execution failed");
    return "notify-send-failed";
  }
  await appendNotificationWarning(options.backupRoot, "notify-send not available");
  return "notify-send-unavailable";
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
  if (env?.ZEN_BACKUP_FORCE_NO_NOTIFY_SEND === "1" && name === "notify-send") {
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

async function appendNotificationWarning(backupRoot: string, warning: string): Promise<void> {
  const backupLogPath = join(backupRoot, "backup.log");
  const line = `[${new Date().toISOString()}] WARNING notifications unavailable: ${warning}\n`;
  await Deno.writeTextFile(backupLogPath, line, { append: true });
}

async function runCommandWithTimeout(
  command: string,
  args: string[],
  timeoutMs: number,
): Promise<{ success: boolean }> {
  try {
    const child = new Deno.Command(command, {
      args,
      stdout: "null",
      stderr: "null",
    }).spawn();
    const statusPromise = child.status.then((status) => ({ success: status.success })).catch(
      () => ({
        success: false,
      }),
    );
    const timeoutPromise = new Promise<{ success: boolean }>((resolve) => {
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
        resolve({ success: false });
      }, timeoutMs);
    });
    return await Promise.race([statusPromise, timeoutPromise]);
  } catch {
    return { success: false };
  }
}
