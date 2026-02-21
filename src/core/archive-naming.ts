import { basename, dirname, extname, join } from "jsr:@std/path@1.1.4";

export function buildArchiveName(kind: "daily" | "weekly", date: Date): string {
  const datePart = date.toISOString().slice(0, 10);
  return `zen-backup-${kind}-${datePart}.tar.gz`;
}

export async function nextArchivePath(
  targetDir: string,
  kind: "daily" | "weekly",
  date: Date,
): Promise<string> {
  const baseName = buildArchiveName(kind, date);
  const firstPath = join(targetDir, baseName);

  if (!(await pathExists(firstPath))) {
    return firstPath;
  }

  const ext = extname(baseName);
  const withoutExt = baseName.slice(0, -ext.length);
  const secondExt = extname(withoutExt);
  const stem = secondExt ? withoutExt.slice(0, -secondExt.length) : withoutExt;
  const fullExt = `${secondExt}${ext}`;

  let suffix = 2;
  while (true) {
    const candidate = join(targetDir, `${stem}-${suffix}${fullExt}`);
    if (!(await pathExists(candidate))) {
      return candidate;
    }
    suffix += 1;
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

export function archiveKindFromPath(archivePath: string): "daily" | "weekly" | "unknown" {
  const name = basename(archivePath);
  if (name.includes("-daily-")) return "daily";
  if (name.includes("-weekly-")) return "weekly";
  return "unknown";
}

export function parentDir(path: string): string {
  return dirname(path);
}
