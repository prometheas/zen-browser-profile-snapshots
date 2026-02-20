import { basename, dirname, join, normalize } from "jsr:@std/path@1.1.4";
import { backupSqliteDatabase } from "./sqlite.ts";

const EXCLUDED_EXACT_FILES = new Set([
  "cookies.sqlite",
  "key4.db",
  "logins.json",
  "cert9.db",
  ".parentlock",
]);

const EXCLUDED_DIR_PREFIXES = [
  "cache2/",
  "crashes/",
  "datareporting/",
  "saved-telemetry-pings/",
  "minidumps/",
  "storage/temporary/",
  "storage/default/chrome/",
];

export interface ArchiveCreationResult {
  warnings: string[];
}

export async function createProfileArchive(
  profilePath: string,
  archivePath: string,
): Promise<ArchiveCreationResult> {
  const stagingDir = await Deno.makeTempDir({ prefix: "zen-backup-staging-" });
  const warnings: string[] = [];

  try {
    await copyAllowedEntries(profilePath, stagingDir, "", warnings);
    await Deno.mkdir(dirname(archivePath), { recursive: true });

    const command = new Deno.Command("tar", {
      args: ["-czf", archivePath, "-C", stagingDir, "."],
      stdout: "null",
      stderr: "piped",
    });

    const result = await command.output();
    if (!result.success) {
      const errorText = new TextDecoder().decode(result.stderr);
      throw new Error(`archive creation failed: ${errorText.trim()}`);
    }

    return { warnings };
  } finally {
    await Deno.remove(stagingDir, { recursive: true }).catch(() => undefined);
  }
}

async function copyAllowedEntries(
  sourceRoot: string,
  targetRoot: string,
  relativeDir: string,
  warnings: string[],
): Promise<void> {
  const sourceDir = relativeDir ? join(sourceRoot, relativeDir) : sourceRoot;

  for await (const entry of Deno.readDir(sourceDir)) {
    const relativePath = normalize(join(relativeDir, entry.name)).replaceAll("\\", "/");
    const fileName = basename(relativePath);

    if (!shouldInclude(relativePath, entry.isDirectory)) {
      continue;
    }

    const sourcePath = join(sourceRoot, relativePath);
    const targetPath = join(targetRoot, relativePath);

    if (entry.isDirectory) {
      await Deno.mkdir(targetPath, { recursive: true });
      await copyAllowedEntries(sourceRoot, targetRoot, relativePath, warnings);
      continue;
    }

    if (!entry.isFile) {
      continue;
    }

    await Deno.mkdir(dirname(targetPath), { recursive: true });

    if (isSqliteFile(fileName)) {
      const result = await backupSqliteDatabase(sourcePath, targetPath);
      if (result.usedFallback) {
        warnings.push(`fallback sqlite copy used for ${relativePath}`);
      }
      continue;
    }

    await Deno.copyFile(sourcePath, targetPath);
  }
}

export function shouldInclude(relativePath: string, isDirectory: boolean): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  const fileName = basename(normalized);

  if (EXCLUDED_EXACT_FILES.has(fileName)) {
    return false;
  }

  if (fileName.endsWith(".sqlite-wal") || fileName.endsWith(".sqlite-shm")) {
    return false;
  }

  for (const prefix of EXCLUDED_DIR_PREFIXES) {
    if (normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)) {
      return false;
    }
  }

  if (normalized === "storage/default" && isDirectory) {
    return true;
  }

  if (normalized.startsWith("storage/default/http")) {
    return false;
  }

  return true;
}

function isSqliteFile(fileName: string): boolean {
  return fileName.endsWith(".sqlite") || fileName.endsWith(".db");
}
