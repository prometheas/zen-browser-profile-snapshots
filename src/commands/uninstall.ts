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
    await uninstallScheduler(options);

    if (config?._meta.config_path) {
      await Deno.remove(config._meta.config_path).catch(() => undefined);
    }

    const purge = options.env?.ZEN_BACKUP_PURGE_BACKUPS === "1";
    if (purge && config?.backup.local_path) {
      await Deno.remove(config.backup.local_path, { recursive: true }).catch(() => undefined);
      stdout.push("Backup archives removed.");
    } else {
      stderr.push(
        "Backup archives were left in place. Re-run with --purge-backups to remove them and free disk space.",
      );
    }
    stdout.push("Scheduled jobs removed.");
    stdout.push("Settings removed.");
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    stderr.push(error instanceof Error ? error.message : String(error));
    return { exitCode: 1, stdout, stderr };
  }
}
