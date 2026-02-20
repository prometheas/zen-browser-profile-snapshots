import { loadConfig } from "../config.ts";
import { uninstallScheduler } from "../platform/scheduler.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runUninstall(options: RuntimeOptions = {}): Promise<{
  exitCode: number;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const config = await loadConfig({ ...options, required: false });
    const scheduler = await uninstallScheduler(options);
    if (scheduler.installed) {
      stdout.push("Scheduler uninstall requested.");
    } else {
      stdout.push("Scheduled jobs removed.");
    }
    stdout.push("Backup archives preserved.");
    if (config?._meta.config_path) {
      stdout.push(`Settings preserved: ${config._meta.config_path}`);
    } else {
      stdout.push("Settings preserved.");
    }
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    stderr.push(error instanceof Error ? error.message : String(error));
    return { exitCode: 1, stdout, stderr };
  }
}
