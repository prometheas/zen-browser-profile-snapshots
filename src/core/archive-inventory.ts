import { join } from "jsr:@std/path@1.1.4";

export interface ArchiveEntry {
  kind: "daily" | "weekly";
  name: string;
  path: string;
  sizeBytes: number;
  date: string | null;
}

export async function listArchives(baseDir: string): Promise<ArchiveEntry[]> {
  const items: ArchiveEntry[] = [];

  for (const kind of ["daily", "weekly"] as const) {
    const dir = join(baseDir, kind);
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile || !entry.name.endsWith(".tar.gz")) continue;
        const path = join(dir, entry.name);
        const stat = await Deno.stat(path);
        items.push({
          kind,
          name: entry.name,
          path,
          sizeBytes: stat.size,
          date: archiveDate(entry.name),
        });
      }
    } catch {
      // Missing kind directory is treated as empty.
    }
  }

  return items;
}

export function archiveDate(name: string): string | null {
  const match = name.match(/^zen-backup-(daily|weekly)-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.tar\.gz$/);
  return match ? match[2] : null;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export function sortByChronologicalName(entries: ArchiveEntry[]): ArchiveEntry[] {
  return [...entries].sort((a, b) => a.name.localeCompare(b.name));
}

export function newestArchive(entries: ArchiveEntry[], kind: "daily" | "weekly"): ArchiveEntry | null {
  const filtered = sortByChronologicalName(entries.filter((entry) => entry.kind === kind));
  return filtered.length > 0 ? filtered[filtered.length - 1] : null;
}

export async function directorySize(path: string): Promise<number> {
  let total = 0;
  try {
    for await (const entry of Deno.readDir(path)) {
      const child = join(path, entry.name);
      if (entry.isFile) {
        const stat = await Deno.stat(child);
        total += stat.size;
      } else if (entry.isDirectory) {
        total += await directorySize(child);
      }
    }
  } catch {
    return 0;
  }
  return total;
}
