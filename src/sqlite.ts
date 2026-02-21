import { dirname } from "jsr:@std/path@1.1.4";

export interface SqliteBackupResult {
  usedFallback: boolean;
}

export async function backupSqliteDatabase(
  sourcePath: string,
  targetPath: string,
): Promise<SqliteBackupResult> {
  await Deno.mkdir(dirname(targetPath), { recursive: true });

  const backupOutcome = await runSqliteCommand(sourcePath, `.backup ${sqliteQuote(targetPath)}`);
  if (backupOutcome.success) {
    await ensureIntegrity(targetPath);
    return { usedFallback: false };
  }

  await fallbackCopyWithCheckpoint(sourcePath, targetPath);
  await ensureIntegrity(targetPath);
  return { usedFallback: true };
}

async function fallbackCopyWithCheckpoint(sourcePath: string, targetPath: string): Promise<void> {
  await Deno.copyFile(sourcePath, targetPath);

  const walSource = `${sourcePath}-wal`;
  const shmSource = `${sourcePath}-shm`;
  const walTarget = `${targetPath}-wal`;
  const shmTarget = `${targetPath}-shm`;

  if (await pathExists(walSource)) {
    await Deno.copyFile(walSource, walTarget);
  }
  if (await pathExists(shmSource)) {
    await Deno.copyFile(shmSource, shmTarget);
  }

  await runSqliteCommand(targetPath, "PRAGMA wal_checkpoint(FULL);");
  await Deno.remove(walTarget).catch(() => undefined);
  await Deno.remove(shmTarget).catch(() => undefined);
}

export async function ensureIntegrity(databasePath: string): Promise<void> {
  const outcome = await runSqliteCommand(databasePath, "PRAGMA integrity_check;");
  if (!outcome.success) {
    throw new Error(`sqlite integrity check failed for ${databasePath}: ${outcome.stderr.trim()}`);
  }

  const output = outcome.stdout.trim().toLowerCase();
  if (!output.includes("ok")) {
    throw new Error(`sqlite integrity check did not return ok for ${databasePath}`);
  }
}

async function runSqliteCommand(dbPath: string, command: string): Promise<{
  success: boolean;
  stdout: string;
  stderr: string;
}> {
  const proc = new Deno.Command("sqlite3", {
    args: [dbPath, command],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await proc.output();
  return {
    success: output.success,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
}

function sqliteQuote(path: string): string {
  return `'${path.replaceAll("'", "''")}'`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
