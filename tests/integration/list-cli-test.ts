import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { toTomlStringLiteral } from "../../src/core/toml-string.ts";
import { runCli } from "../../src/main.ts";

Deno.test("list shows daily and weekly archives in chronological order", async () => {
  const { tempDir, backupDir } = await createWorkspace();

  await writeArchive(join(backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz"), 2500);
  await writeArchive(join(backupDir, "daily", "zen-backup-daily-2026-01-14.tar.gz"), 2400);
  await writeArchive(join(backupDir, "weekly", "zen-backup-weekly-2026-01-12.tar.gz"), 2600);

  const result = await runCli(["list"], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "daily:");
  assertStringIncludes(result.stdout, "weekly:");
  assertStringIncludes(result.stdout, "zen-backup-daily-2026-01-14.tar.gz");
  assertStringIncludes(result.stdout, "zen-backup-daily-2026-01-15.tar.gz");
  assertStringIncludes(result.stdout, "zen-backup-weekly-2026-01-12.tar.gz");

  const i14 = result.stdout.indexOf("2026-01-14");
  const i15 = result.stdout.indexOf("2026-01-15");
  assertEquals(i14 < i15, true);
});

Deno.test("list handles empty backup directory", async () => {
  const { tempDir } = await createWorkspace();

  const result = await runCli(["list"], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout.toLowerCase(), "empty");
});

Deno.test("list errors when backup directory is missing", async () => {
  const tempDir = await Deno.makeTempDir();
  const configDir = join(tempDir, "custom");
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = ${toTomlStringLiteral(join(tempDir, "profile"))}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(join(tempDir, "missing-backups"))
    }\n`,
  );

  const result = await runCli(["list"], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr.toLowerCase(), "not found");
});

async function createWorkspace(): Promise<{ tempDir: string; backupDir: string }> {
  const tempDir = await Deno.makeTempDir();
  const backupDir = join(tempDir, "backups");
  const profileDir = join(tempDir, "profile");
  const configDir = join(tempDir, "custom");

  await Deno.mkdir(backupDir, { recursive: true });
  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = ${toTomlStringLiteral(profileDir)}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(backupDir)
    }\n`,
  );

  return { tempDir, backupDir };
}

async function writeArchive(path: string, bytes: number): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeFile(path, new Uint8Array(bytes));
}
