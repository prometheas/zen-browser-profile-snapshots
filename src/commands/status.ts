import { join } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../config.ts";
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

    const dailyDir = join(config.backup.local_path, "daily");
    const weeklyDir = join(config.backup.local_path, "weekly");
    const latestDaily = await latestArchive(dailyDir);
    const latestWeekly = await latestArchive(weeklyDir);

    stdout.push(latestDaily ? `Latest daily: ${latestDaily}` : "No daily backups yet");
    stdout.push(latestWeekly ? `Latest weekly: ${latestWeekly}` : "No weekly backups yet");
    stdout.push("Scheduled jobs: not installed");

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

async function latestArchive(directory: string): Promise<string | null> {
  try {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(directory)) {
      if (entry.isFile && entry.name.endsWith(".tar.gz")) {
        entries.push(entry.name);
      }
    }
    if (entries.length === 0) return null;
    entries.sort();
    return entries[entries.length - 1];
  } catch {
    return null;
  }
}
