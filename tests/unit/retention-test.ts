import { assertEquals } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { pruneArchives } from "../../src/core/retention.ts";

Deno.test("pruneArchives deletes only stale tar.gz archives by filename date", async () => {
  const root = await Deno.makeTempDir();
  const dailyDir = join(root, "daily");
  await Deno.mkdir(dailyDir, { recursive: true });

  await Deno.writeFile(join(dailyDir, "zen-backup-daily-2026-01-15.tar.gz"), new Uint8Array(10));
  await Deno.writeFile(join(dailyDir, "zen-backup-daily-2026-01-05.tar.gz"), new Uint8Array(10));
  await Deno.writeTextFile(join(dailyDir, "backup.log"), "keep");
  await Deno.writeTextFile(join(dailyDir, ".DS_Store"), "keep");

  const result = await pruneArchives(root, "daily", 7, new Date("2026-01-16T00:00:00Z"));

  assertEquals(result.deleted.length, 1);
  assertEquals(
    await exists(join(dailyDir, "zen-backup-daily-2026-01-15.tar.gz")),
    true,
  );
  assertEquals(
    await exists(join(dailyDir, "zen-backup-daily-2026-01-05.tar.gz")),
    false,
  );
  assertEquals(await exists(join(dailyDir, "backup.log")), true);
});

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
