import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { toTomlStringLiteral } from "../../src/core/toml-string.ts";
import { runCli } from "../../src/main.ts";

Deno.test("restore replaces profile with archive content and creates pre-restore backup", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "prefs.js"), "old-pref");
  await createSqliteDb(join(profileDir, "places.sqlite"));

  const archivePath = join(backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz");
  const staging = await Deno.makeTempDir();
  await Deno.writeTextFile(join(staging, "prefs.js"), 'user_pref("test", true);');
  await createSqliteDb(join(staging, "places.sqlite"));
  await Deno.writeTextFile(join(staging, "extensions.json"), '{"addons":[]}');
  await createArchiveFromDir(archivePath, staging);

  const result = await runCli(["restore", archivePath], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, archivePath);
  assertStringIncludes(result.stdout, "pre-restore");
  assertEquals(await Deno.readTextFile(join(profileDir, "prefs.js")), 'user_pref("test", true);');
  assertEquals(await Deno.readTextFile(join(profileDir, "extensions.json")), '{"addons":[]}');
  assertEquals(await hasPreRestoreDir(tempDir, "profile"), true);
});

Deno.test("restore finds archive by filename in backup directories", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "prefs.js"), "old-pref");
  const fileName = "zen-backup-weekly-2026-01-12.tar.gz";
  await createArchiveWithFiles(join(backupDir, "weekly", fileName), {
    "prefs.js": "weekly-pref",
  });

  const result = await runCli(["restore", fileName], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 0);
  assertEquals(await Deno.readTextFile(join(profileDir, "prefs.js")), "weekly-pref");
});

Deno.test("restore is blocked when browser is running", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "prefs.js"), "original");
  const archivePath = join(backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz");
  await createArchiveWithFiles(archivePath, { "prefs.js": "new" });

  const result = await runCli(["restore", archivePath], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
      ZEN_BACKUP_BROWSER_RUNNING: "1",
    },
  });

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr, "must be closed");
  assertEquals(await Deno.readTextFile(join(profileDir, "prefs.js")), "original");
});

Deno.test("restore fails for corrupted archive and preserves profile", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "prefs.js"), "original");
  const archivePath = join(backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz");
  await Deno.writeTextFile(archivePath, "not-a-tar");

  const result = await runCli(["restore", archivePath], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr.toLowerCase(), "invalid");
  assertStringIncludes(result.stderr, "zen-backup-daily-2026-01-15");
  assertEquals(await Deno.readTextFile(join(profileDir, "prefs.js")), "original");
});

async function createWorkspace(): Promise<
  { tempDir: string; profileDir: string; backupDir: string }
> {
  const tempDir = await Deno.makeTempDir();
  const profileDir = join(tempDir, "profile");
  const backupDir = join(tempDir, "backups");
  const configDir = join(tempDir, "custom");
  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(join(backupDir, "daily"), { recursive: true });
  await Deno.mkdir(join(backupDir, "weekly"), { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });

  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = ${toTomlStringLiteral(profileDir)}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(backupDir)
    }\n`,
  );

  return { tempDir, profileDir, backupDir };
}

async function createArchiveWithFiles(
  archivePath: string,
  files: Record<string, string>,
): Promise<void> {
  const staging = await Deno.makeTempDir();
  for (const [name, content] of Object.entries(files)) {
    const path = join(staging, name);
    await Deno.mkdir(dirname(path), { recursive: true });
    await Deno.writeTextFile(path, content);
  }

  await createArchiveFromDir(archivePath, staging);
}

async function createArchiveFromDir(archivePath: string, dir: string): Promise<void> {
  const out = await new Deno.Command("tar", {
    args: ["-czf", archivePath, "-C", dir, "."],
    stdout: "null",
    stderr: "piped",
  }).output();

  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function createSqliteDb(path: string): Promise<void> {
  const out = await new Deno.Command("sqlite3", {
    args: [
      path,
      "CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t(v) VALUES('x');",
    ],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function hasPreRestoreDir(root: string, profileName: string): Promise<boolean> {
  for await (const entry of Deno.readDir(root)) {
    if (entry.isDirectory && entry.name.startsWith(`${profileName}.pre-restore-`)) return true;
  }
  return false;
}
