import { basename, join } from "jsr:@std/path@1.1.4";
import { createProfileArchive } from "../archive.ts";
import { loadConfig } from "../config.ts";
import { nextArchivePath } from "../core/archive_naming.ts";
import { pruneArchives } from "../core/retention.ts";
import { CliError } from "../errors.ts";
import { appendLog } from "../log.ts";
import { notify } from "../platform/notifications.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runBackup(
  kind: "daily" | "weekly",
  options: RuntimeOptions = {},
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const config = await loadConfig({ ...options, required: true });
    if (!config) {
      throw new CliError("config file not found", "ERR_CONFIG_NOT_FOUND", 1);
    }

    try {
      await Deno.stat(config.profile.path);
    } catch {
      await notify({
        backupRoot: config.backup.local_path,
        os: options.os ?? (Deno.build.os as "darwin" | "linux" | "windows"),
        enabled: config.notifications.enabled,
        title: "Zen Backup Error",
        message: `profile path not found: ${config.profile.path}`,
        env: options.env,
      });
      throw new CliError(`profile path not found: ${config.profile.path}`, "ERR_PROFILE_NOT_FOUND", 1);
    }

    if (options.env?.ZEN_BACKUP_BROWSER_RUNNING === "1") {
      const message =
        "browser is running; SQLite databases are safely backed up, but session files may be mid-write";
      await appendLog(config.backup.local_path, "WARNING", message);
      await notify({
        backupRoot: config.backup.local_path,
        os: options.os ?? (Deno.build.os as "darwin" | "linux" | "windows"),
        enabled: config.notifications.enabled,
        title: "Zen Backup",
        message,
        env: options.env,
      });
    }

    const kindDir = join(config.backup.local_path, kind);
    await Deno.mkdir(kindDir, { recursive: true });

    const archivePath = await nextArchivePath(kindDir, kind, new Date());
    let archiveWarnings: string[] = [];
    try {
      const archiveResult = await createProfileArchive(config.profile.path, archivePath);
      archiveWarnings = archiveResult.warnings;
    } catch (error) {
      await Deno.remove(archivePath).catch(() => undefined);
      throw error;
    }

    for (const warning of archiveWarnings) {
      await appendLog(config.backup.local_path, "WARNING", warning);
    }

    let partialFailure = false;
    const retentionDays = kind === "daily" ? config.retention.daily_days : config.retention.weekly_days;
    const now = options.now ?? new Date();

    const localPrune = await pruneArchives(config.backup.local_path, kind, retentionDays, now);
    for (const path of localPrune.deleted) {
      await appendLog(config.backup.local_path, "SUCCESS", `pruned old ${kind} backup ${path}`);
    }

    if (config.backup.cloud_path) {
      try {
        const cloudKindDir = join(config.backup.cloud_path, kind);
        await Deno.mkdir(cloudKindDir, { recursive: true });
        const cloudArchivePath = join(cloudKindDir, basename(archivePath));
        await Deno.copyFile(archivePath, cloudArchivePath);
        await pruneArchives(config.backup.cloud_path, kind, retentionDays, now);
      } catch (error) {
        partialFailure = true;
        const message = error instanceof Error ? error.message : String(error);
        await appendLog(config.backup.local_path, "ERROR", `cloud sync failed: ${message}`);
        await notify({
          backupRoot: config.backup.local_path,
          os: options.os ?? (Deno.build.os as "darwin" | "linux" | "windows"),
          enabled: config.notifications.enabled,
          title: "Zen Backup Warning",
          message: `cloud sync failed: ${message}`,
          env: options.env,
        });
        stderr.push(`cloud sync failed: ${message}`);
      }
    }

    await appendLog(config.backup.local_path, "SUCCESS", `created ${kind} backup ${archivePath}`);
    stdout.push(`Created ${kind} backup: ${archivePath}`);

    return { exitCode: partialFailure ? 1 : 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return { exitCode: 1, stdout, stderr };
  }
}
