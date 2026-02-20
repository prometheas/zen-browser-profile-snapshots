import {
  assert,
  assertEquals,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("backup daily creates tar.gz in daily subdirectory", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await seedPlacesDatabase(join(profileDir, "places.sqlite"));

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Created daily backup:");
  const archivePath = result.stdout.split(": ").at(-1) ?? "";
  assertMatch(archivePath, /daily\/zen-backup-daily-\d{4}-\d{2}-\d{2}(?:-\d+)?\.tar\.gz$/);

  const list = await listArchive(archivePath);
  assert(list.includes("./places.sqlite") || list.includes("places.sqlite"));
  assertEquals(await pathExists(join(backupDir, "backup.log")), true);
});

Deno.test("backup weekly creates tar.gz in weekly subdirectory", async () => {
  const { tempDir, profileDir } = await createWorkspace();
  await seedPlacesDatabase(join(profileDir, "places.sqlite"));

  const result = await runCli(["backup", "weekly"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  const archivePath = result.stdout.split(": ").at(-1) ?? "";
  assertMatch(archivePath, /weekly\/zen-backup-weekly-\d{4}-\d{2}-\d{2}(?:-\d+)?\.tar\.gz$/);
});

Deno.test("backup includes valid sqlite DB and preserves key tables", async () => {
  const { tempDir, profileDir } = await createWorkspace();
  const sourceDb = join(profileDir, "places.sqlite");
  await seedPlacesDatabase(sourceDb);

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  const archivePath = result.stdout.split(": ").at(-1) ?? "";

  const extracted = await Deno.makeTempDir();
  await extractArchive(archivePath, extracted);

  const restoredDb = join(extracted, "places.sqlite");
  const integrity = await sqliteQuery(restoredDb, "PRAGMA integrity_check;");
  assertStringIncludes(integrity.toLowerCase(), "ok");

  const tables = await sqliteQuery(
    restoredDb,
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
  );
  assertStringIncludes(tables, "moz_places");
  assertStringIncludes(tables, "moz_bookmarks");
});

Deno.test("backup excludes sqlite wal and shm files", async () => {
  const { tempDir, profileDir } = await createWorkspace();
  const sourceDb = join(profileDir, "places.sqlite");
  await seedPlacesDatabase(sourceDb);

  const walPath = `${sourceDb}-wal`;
  const shmPath = `${sourceDb}-shm`;
  await Deno.writeTextFile(walPath, "wal");
  await Deno.writeTextFile(shmPath, "shm");
  assertEquals(await pathExists(walPath), true);
  assertEquals(await pathExists(shmPath), true);

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  const archivePath = result.stdout.split(": ").at(-1) ?? "";
  const list = await listArchive(archivePath);
  const joined = list.join("\n");

  assertStringIncludes(joined, "places.sqlite");
  assertEquals(joined.includes("places.sqlite-wal"), false);
  assertEquals(joined.includes("places.sqlite-shm"), false);
});

Deno.test("backup falls back on locked sqlite and logs warning", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  const sourceDb = join(profileDir, "places.sqlite");
  await seedPlacesDatabase(sourceDb);

  const lockProc = new Deno.Command("sqlite3", {
    args: [sourceDb],
    stdin: "piped",
    stdout: "null",
    stderr: "null",
  }).spawn();

  const writer = lockProc.stdin.getWriter();
  const encoder = new TextEncoder();
  await writer.write(encoder.encode("PRAGMA locking_mode=EXCLUSIVE;\nBEGIN EXCLUSIVE;\nSELECT 1;\n"));

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  await writer.write(encoder.encode("ROLLBACK;\n.quit\n"));
  await writer.close();
  await lockProc.status;

  assertEquals(result.exitCode, 0);

  const logContent = await Deno.readTextFile(join(backupDir, "backup.log"));
  assert(
    logContent.includes("fallback") || logContent.includes("retry"),
    `expected fallback warning in log, got: ${logContent}`,
  );

  const archivePath = result.stdout.split(": ").at(-1) ?? "";
  const extracted = await Deno.makeTempDir();
  await extractArchive(archivePath, extracted);

  const restoredDb = join(extracted, "places.sqlite");
  const integrity = await sqliteQuery(restoredDb, "PRAGMA integrity_check;");
  assertStringIncludes(integrity.toLowerCase(), "ok");
});

Deno.test("backup excludes security-sensitive and cache files", async () => {
  const { tempDir, profileDir } = await createWorkspace();
  await seedPlacesDatabase(join(profileDir, "places.sqlite"));
  await Deno.writeTextFile(join(profileDir, "cookies.sqlite"), "secret");
  await Deno.mkdir(join(profileDir, "cache2", "entries"), { recursive: true });
  await Deno.writeTextFile(join(profileDir, "cache2", "entries", "ABC"), "cache");

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  const archivePath = result.stdout.split(": ").at(-1) ?? "";
  const list = await listArchive(archivePath);
  const joined = list.join("\n");
  assertStringIncludes(joined, "places.sqlite");
  assertEquals(joined.includes("cookies.sqlite"), false);
  assertEquals(joined.includes("cache2/"), false);
});

Deno.test("backup errors when profile path does not exist and no archive is created", async () => {
  const tempDir = await Deno.makeTempDir();
  const backupDir = join(tempDir, "backups");
  const configDir = join(tempDir, "custom");
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = "${join(tempDir, "missing-profile")}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr, "profile path not found");

  const dailyDir = join(backupDir, "daily");
  const exists = await pathExists(dailyDir);
  if (exists) {
    const entries = [];
    for await (const entry of Deno.readDir(dailyDir)) {
      entries.push(entry.name);
    }
    assertEquals(entries.length, 0);
  }
});

async function createWorkspace(): Promise<{ tempDir: string; profileDir: string; backupDir: string }> {
  const tempDir = await Deno.makeTempDir();
  const profileDir = join(tempDir, "profile");
  const backupDir = join(tempDir, "backups");
  const configDir = join(tempDir, "custom");

  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });

  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );

  return { tempDir, profileDir, backupDir };
}

async function listArchive(archivePath: string): Promise<string[]> {
  const command = new Deno.Command("tar", {
    args: ["-tzf", archivePath],
    stdout: "piped",
    stderr: "piped",
  });

  const output = await command.output();
  if (!output.success) {
    const err = new TextDecoder().decode(output.stderr);
    throw new Error(`failed to list archive: ${err}`);
  }

  const text = new TextDecoder().decode(output.stdout).trim();
  if (!text) return [];
  return text.split("\n");
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  const cmd = new Deno.Command("tar", {
    args: ["-xzf", archivePath, "-C", destination],
    stdout: "null",
    stderr: "piped",
  });
  const out = await cmd.output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function sqliteExec(dbPath: string, sql: string): Promise<void> {
  const cmd = new Deno.Command("sqlite3", {
    args: [dbPath, sql],
    stdout: "null",
    stderr: "piped",
  });
  const out = await cmd.output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function sqliteQuery(dbPath: string, sql: string): Promise<string> {
  const cmd = new Deno.Command("sqlite3", {
    args: [dbPath, sql],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return new TextDecoder().decode(out.stdout);
}

async function seedPlacesDatabase(dbPath: string): Promise<void> {
  await sqliteExec(
    dbPath,
    "CREATE TABLE IF NOT EXISTS moz_places(id INTEGER PRIMARY KEY, url TEXT);" +
      "CREATE TABLE IF NOT EXISTS moz_bookmarks(id INTEGER PRIMARY KEY, place_id INTEGER);" +
      "INSERT INTO moz_places(url) VALUES('https://example.com');" +
      "INSERT INTO moz_bookmarks(place_id) VALUES(1);",
  );
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
