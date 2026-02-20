import { basename, dirname, isAbsolute, join, resolve } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../config.ts";
import { CliError } from "../errors.ts";
import { appendLog } from "../log.ts";
import { ensureIntegrity } from "../sqlite.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runRestore(
  archiveArg: string,
  options: RuntimeOptions = {},
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const config = await loadConfig({ ...options, required: true });
    if (!config) {
      throw new CliError("config file not found", "ERR_CONFIG_NOT_FOUND", 1);
    }

    const browserRunning = isBrowserRunning(options);
    if (browserRunning) {
      throw new CliError(
        "Zen browser must be closed before restoring",
        "ERR_BROWSER_RUNNING",
        1,
      );
    }

    const archivePath = await resolveArchivePath(archiveArg, config.backup.local_path, options);
    const stagingDir = await extractArchiveSafely(archivePath);

    const now = options.now ?? new Date();
    const preRestorePath = await rotateProfileToPreRestore(config.profile.path, now);
    await Deno.mkdir(config.profile.path, { recursive: true });
    await copyDirContents(stagingDir, config.profile.path);
    await Deno.remove(stagingDir, { recursive: true }).catch(() => undefined);
    await validateSqliteFiles(config.profile.path);

    await appendLog(
      config.backup.local_path,
      "RESTORE",
      `restored profile from ${basename(archivePath)}`,
    );
    stdout.push(`Restored from archive: ${archivePath}`);
    stdout.push(`Pre-restore backup: ${preRestorePath}`);
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    stderr.push(message);
    return { exitCode: 1, stdout, stderr };
  }
}

async function resolveArchivePath(
  input: string,
  backupRoot: string,
  options: RuntimeOptions,
): Promise<string> {
  const cwd = options.cwd ?? Deno.cwd();
  const candidates = [
    isAbsolute(input) ? input : resolve(cwd, input),
    join(backupRoot, input),
    join(backupRoot, "daily", input),
    join(backupRoot, "weekly", input),
  ];

  for (const candidate of candidates) {
    if (await exists(candidate)) return candidate;
  }

  throw new CliError(`archive not found: ${input}`, "ERR_ARCHIVE_NOT_FOUND", 1);
}

async function extractArchiveSafely(archivePath: string): Promise<string> {
  const listed = await new Deno.Command("tar", {
    args: ["-tzf", archivePath],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!listed.success) {
    throw new CliError(
      `invalid or corrupted archive: ${basename(archivePath)}`,
      "ERR_ARCHIVE_INVALID",
      1,
    );
  }

  const listing = new TextDecoder().decode(listed.stdout).trim();
  const entries = listing.length === 0 ? [] : listing.split("\n");
  for (const raw of entries) {
    const candidate = sanitizeTarEntry(raw);
    if (!candidate) continue;
    if (candidate.split("/").includes("..")) {
      throw new CliError(`invalid archive entry: ${raw}`, "ERR_ARCHIVE_INVALID", 1);
    }
    if (/^[A-Za-z]:\//.test(candidate)) {
      throw new CliError(`invalid archive entry: ${raw}`, "ERR_ARCHIVE_INVALID", 1);
    }
  }

  const stagingDir = await Deno.makeTempDir({ prefix: "zen-restore-staging-" });
  const extracted = await new Deno.Command("tar", {
    args: ["-xzf", archivePath, "-C", stagingDir],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!extracted.success) {
    await Deno.remove(stagingDir, { recursive: true }).catch(() => undefined);
    throw new CliError(
      `invalid or corrupted archive: ${basename(archivePath)}`,
      "ERR_ARCHIVE_INVALID",
      1,
    );
  }

  return stagingDir;
}

function sanitizeTarEntry(entry: string): string {
  let value = entry.trim().replaceAll("\\", "/");
  while (value.startsWith("./")) value = value.slice(2);
  while (value.startsWith("/")) value = value.slice(1);
  return value;
}

async function rotateProfileToPreRestore(profilePath: string, now: Date): Promise<string> {
  const stamp = now.toISOString().slice(0, 10);
  let candidate = `${profilePath}.pre-restore-${stamp}`;
  let index = 2;
  while (await exists(candidate)) {
    candidate = `${profilePath}.pre-restore-${stamp}-${index}`;
    index += 1;
  }

  if (await exists(profilePath)) {
    await Deno.rename(profilePath, candidate);
  } else {
    await Deno.mkdir(candidate, { recursive: true });
  }
  return candidate;
}

async function copyDirContents(fromDir: string, toDir: string): Promise<void> {
  for await (const entry of Deno.readDir(fromDir)) {
    const source = join(fromDir, entry.name);
    const target = join(toDir, entry.name);
    if (entry.isDirectory) {
      await Deno.mkdir(target, { recursive: true });
      await copyDirContents(source, target);
      continue;
    }
    if (entry.isFile) {
      await Deno.mkdir(dirname(target), { recursive: true });
      await Deno.copyFile(source, target);
    }
  }
}

async function validateSqliteFiles(root: string): Promise<void> {
  for await (const file of walkFiles(root)) {
    if (file.endsWith(".sqlite")) {
      await ensureIntegrity(file);
    }
  }
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(root)) {
    const path = join(root, entry.name);
    if (entry.isDirectory) {
      yield* walkFiles(path);
    } else if (entry.isFile) {
      yield path;
    }
  }
}

function isBrowserRunning(options: RuntimeOptions): boolean {
  return options.env?.ZEN_BACKUP_BROWSER_RUNNING === "1";
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
