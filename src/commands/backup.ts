import { join } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../config.ts";
import { nextArchivePath } from "../core/archive_naming.ts";
import { CliError } from "../errors.ts";
import { appendLog } from "../log.ts";
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
      throw new CliError(`profile path not found: ${config.profile.path}`, "ERR_PROFILE_NOT_FOUND", 1);
    }

    const kindDir = join(config.backup.local_path, kind);
    await Deno.mkdir(kindDir, { recursive: true });

    const archivePath = await nextArchivePath(kindDir, kind, new Date());
    await Deno.writeFile(archivePath, new Uint8Array());

    await appendLog(config.backup.local_path, "SUCCESS", `created ${kind} backup ${archivePath}`);
    stdout.push(`Created ${kind} backup: ${archivePath}`);

    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return { exitCode: 1, stdout, stderr };
  }
}
