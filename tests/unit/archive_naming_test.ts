import { assertEquals } from "jsr:@std/assert@1.0.19";
import { buildArchiveName } from "../../src/core/archive_naming.ts";

Deno.test("buildArchiveName uses YYYY-MM-DD format", () => {
  const date = new Date("2026-01-15T08:10:00.000Z");
  assertEquals(buildArchiveName("daily", date), "zen-backup-daily-2026-01-15.tar.gz");
  assertEquals(buildArchiveName("weekly", date), "zen-backup-weekly-2026-01-15.tar.gz");
});
