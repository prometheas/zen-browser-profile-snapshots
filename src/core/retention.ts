import { join } from "jsr:@std/path@1.1.4";
import { archiveDate } from "./archive_inventory.ts";

export async function pruneArchives(
  root: string,
  kind: "daily" | "weekly",
  retentionDays: number,
  now = new Date(),
): Promise<{ deleted: string[] }> {
  const dir = join(root, kind);
  const deleted: string[] = [];

  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".tar.gz")) continue;
      const date = archiveDate(entry.name);
      if (!date) continue;

      const age = ageInDays(date, now);
      if (age > retentionDays) {
        const path = join(dir, entry.name);
        await Deno.remove(path).catch(() => undefined);
        deleted.push(path);
      }
    }
  } catch {
    // Missing directory is treated as empty.
  }

  return { deleted };
}

function ageInDays(datePart: string, now: Date): number {
  const archiveTime = new Date(`${datePart}T00:00:00Z`).getTime();
  const nowTime = now.getTime();
  const deltaMs = nowTime - archiveTime;
  return Math.floor(deltaMs / (24 * 60 * 60 * 1000));
}
