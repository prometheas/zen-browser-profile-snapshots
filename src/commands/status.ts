import { join } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../config.ts";
import {
  archiveDate,
  directorySize,
  formatSize,
  listArchives,
  newestArchive,
} from "../core/archive_inventory.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runStatus(options: RuntimeOptions = {}): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const config = await loadConfig({ ...options, required: false });

    if (!config) {
      stdout.push("Not installed");
      stdout.push('Run "zen-backup install" to configure backups.');
      return { exitCode: 0, stdout, stderr };
    }

    stdout.push("Zen Profile Backup Status");
    stdout.push(`Profile path: ${config.profile.path}`);
    stdout.push(`Backup directory: ${config.backup.local_path}`);
    stdout.push(config.backup.cloud_path ? `Cloud sync: enabled (${config.backup.cloud_path})` : "Cloud sync: local only");
    stdout.push(`Retention: daily ${config.retention.daily_days} days, weekly ${config.retention.weekly_days} days`);

    const backupDirectoryExists = await exists(config.backup.local_path);
    if (!backupDirectoryExists) {
      stdout.push("Backup directory not found. Run a backup or check configuration.");
      return { exitCode: 0, stdout, stderr };
    }

    const canReadBackups = await isReadableDirectory(config.backup.local_path);
    if (!canReadBackups.ok) {
      stderr.push("Backup directory is not readable.");
      return { exitCode: 1, stdout, stderr };
    }

    const dailyDir = join(config.backup.local_path, "daily");
    const weeklyDir = join(config.backup.local_path, "weekly");
    const archives = await listArchives(config.backup.local_path);
    const latestDaily = newestArchive(archives, "daily");
    const latestWeekly = newestArchive(archives, "weekly");

    stdout.push(
      latestDaily
        ? `Latest daily: ${latestDaily.name} (${formatSize(latestDaily.sizeBytes)})`
        : "No daily backups yet",
    );
    stdout.push(
      latestWeekly
        ? `Latest weekly: ${latestWeekly.name} (${formatSize(latestWeekly.sizeBytes)})`
        : "No weekly backups yet",
    );

    const dailySize = await directorySize(dailyDir);
    const weeklySize = await directorySize(weeklyDir);
    const totalSize = dailySize + weeklySize;
    stdout.push(`Disk usage total: ${formatSize(totalSize)}`);
    stdout.push(`Disk usage daily: ${formatSize(dailySize)}`);
    stdout.push(`Disk usage weekly: ${formatSize(weeklySize)}`);

    const staleWarning = latestDaily
      ? dailyStalenessMessage(latestDaily.name, options.now ?? new Date())
      : "No backups yet. Run a backup.";
    if (staleWarning) {
      stdout.push(staleWarning);
    }

    const schedulerInstalled = await exists(join(config.backup.local_path, ".scheduler-installed"));
    stdout.push(schedulerInstalled ? "Scheduled jobs: active" : "Scheduled jobs: not installed");

    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return { exitCode: 1, stdout, stderr };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

function dailyStalenessMessage(archiveName: string, now: Date): string | null {
  const date = archiveDate(archiveName);
  if (!date) return null;

  const ageDays = Math.floor((now.getTime() - new Date(`${date}T00:00:00Z`).getTime()) / (24 * 60 * 60 * 1000));
  if (ageDays > 3) {
    return "Warning: latest daily backup is stale.";
  }
  return "Health: recent daily backup exists.";
}

async function isReadableDirectory(path: string): Promise<{ ok: boolean }> {
  try {
    for await (const _entry of Deno.readDir(path)) {
      break;
    }
    return { ok: true };
  } catch (error) {
    if (error instanceof Deno.errors.PermissionDenied) {
      return { ok: false };
    }
    throw error;
  }
}
