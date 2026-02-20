import { loadConfig } from "../config.ts";
import { CliError } from "../errors.ts";
import { formatSize, listArchives, sortByChronologicalName } from "../core/archive_inventory.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runList(options: RuntimeOptions = {}): Promise<{
  exitCode: number;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const config = await loadConfig({ ...options, required: true });
    if (!config) {
      throw new CliError("config file not found", "ERR_CONFIG_NOT_FOUND", 1);
    }

    try {
      await Deno.stat(config.backup.local_path);
    } catch {
      throw new CliError(
        `backup directory not found: ${config.backup.local_path}`,
        "ERR_BACKUP_DIR_NOT_FOUND",
        1,
      );
    }

    const entries = sortByChronologicalName(await listArchives(config.backup.local_path));
    if (entries.length === 0) {
      stdout.push("No backups found (empty backup directory).");
      return { exitCode: 0, stdout, stderr };
    }

    stdout.push("daily:");
    for (const entry of entries.filter((entry) => entry.kind === "daily")) {
      stdout.push(`  ${entry.name} (${formatSize(entry.sizeBytes)})`);
    }

    stdout.push("weekly:");
    for (const entry of entries.filter((entry) => entry.kind === "weekly")) {
      stdout.push(`  ${entry.name} (${formatSize(entry.sizeBytes)})`);
    }

    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return { exitCode: 1, stdout, stderr };
  }
}
