import { DataTable, Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { toTomlStringLiteral } from "../../../src/core/toml-string.ts";
import { runCli } from "../../../src/main.ts";
import { ZenWorld } from "../support/world.ts";

Given("a valid backup archive {string} exists", async function (this: ZenWorld, name: string) {
  await ensureRestoreWorkspace(this);
  this.restoreArchiveName = name;
  this.restoreArchivePath = archivePathForName(this, name);
  await writeArchiveFromEntries(this.restoreArchivePath, this.restoreEntries);
});

Given("the archive contains:", async function (this: ZenWorld, table: DataTable) {
  for (const row of table.hashes()) {
    this.restoreEntries[row.file] = row.content;
  }
  await ensureRestoreWorkspace(this);
  if (!this.restoreArchivePath) {
    this.restoreArchiveName = "zen-backup-daily-2026-01-15.tar.gz";
    this.restoreArchivePath = archivePathForName(this, this.restoreArchiveName);
  }
  await writeArchiveFromEntries(this.restoreArchivePath, this.restoreEntries);
});

Given(
  "the current profile directory exists with different content",
  async function (this: ZenWorld) {
    await ensureRestoreWorkspace(this);
    await Deno.writeTextFile(join(this.profileDir, "prefs.js"), "old prefs");
    await Deno.writeTextFile(join(this.profileDir, "extensions.json"), '{"old":true}');
    await Deno.writeTextFile(join(this.profileDir, "places.sqlite"), "old profile");
    this.profileBeforeRestore = await snapshotProfile(this.profileDir);
  },
);

Given("the Zen browser is not running", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_BROWSER_RUNNING = undefined;
});

Given("the Zen browser is running", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_BROWSER_RUNNING = "1";
});

Given("a Zen browser process is running", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_BROWSER_RUNNING = "1";
});

Given(
  "the archive contains SQLite databases with multiple tables",
  async function (this: ZenWorld) {
    this.restoreEntries["places.sqlite"] = "__SQLITE__";
    this.restoreEntries["favicons.sqlite"] = "__SQLITE__";
    await ensureRestoreWorkspace(this);
    if (!this.restoreArchivePath) {
      this.restoreArchiveName = "zen-backup-daily-2026-01-15.tar.gz";
      this.restoreArchivePath = archivePathForName(this, this.restoreArchiveName);
    }
    await writeArchiveFromEntries(this.restoreArchivePath, this.restoreEntries);
  },
);

Given("the current profile contains:", async function (this: ZenWorld, table: DataTable) {
  await ensureRestoreWorkspace(this);
  for (const row of table.hashes()) {
    await writeProfileFixture(this.profileDir, row.file, row.content);
  }
  this.profileBeforeRestore = await snapshotProfile(this.profileDir);
});

Given("a corrupted archive {string} exists", async function (this: ZenWorld, name: string) {
  await ensureRestoreWorkspace(this);
  this.restoreArchiveName = name;
  this.restoreArchivePath = archivePathForName(this, name);
  await Deno.mkdir(dirname(this.restoreArchivePath), { recursive: true });
  await Deno.writeTextFile(this.restoreArchivePath, "not-a-valid-archive");
});

Given("an archive created with absolute paths", async function (this: ZenWorld) {
  await ensureRestoreWorkspace(this);
  const sourceDir = await Deno.makeTempDir();
  const sourceFile = join(sourceDir, "places.sqlite");
  await createSqliteDb(sourceFile);

  const archivePath = archivePathForName(this, "zen-backup-daily-2026-01-15.tar.gz");
  await Deno.mkdir(dirname(archivePath), { recursive: true });
  const out = await new Deno.Command("tar", {
    args: ["-czf", archivePath, "-P", sourceFile],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }

  this.restoreArchiveName = "zen-backup-daily-2026-01-15.tar.gz";
  this.restoreArchivePath = archivePath;
  this.absoluteArchiveSourcePath = sourceFile;
});

When("restore is run with archive {string}", async function (this: ZenWorld, name: string) {
  await runRestoreCommand(this, name);
});

When("restore is attempted with archive {string}", async function (this: ZenWorld, name: string) {
  await runRestoreCommand(this, name);
});

When("restore is run with the archive", async function (this: ZenWorld) {
  await runRestoreCommand(this, this.restoreArchiveName);
});

Then("the profile directory contains {string}", async function (this: ZenWorld, file: string) {
  assertEquals(await exists(join(this.profileDir, file)), true);
});

Then(
  "{string} in the profile passes {string}",
  async function (this: ZenWorld, file: string, _pragma: string) {
    const dbPath = join(this.profileDir, file);
    const out = await sqliteQuery(dbPath, "PRAGMA integrity_check;");
    assertStringIncludes(out.toLowerCase(), "ok");
  },
);

Then(
  "every {string} file in the profile passes {string}",
  async function (this: ZenWorld, suffix: string, _pragma: string) {
    const files = await listFiles(this.profileDir);
    const sqliteFiles = files.filter((file) => file.endsWith(suffix));
    assert(sqliteFiles.length > 0, "expected sqlite files in profile");
    for (const file of sqliteFiles) {
      const out = await sqliteQuery(join(this.profileDir, file), "PRAGMA integrity_check;");
      assertStringIncludes(out.toLowerCase(), "ok");
    }
  },
);

Then(
  "a directory exists matching pattern {string}",
  async function (this: ZenWorld, pattern: string) {
    const expected = pattern.replace("<profile>", this.profileDir);
    const regex = new RegExp(expected);
    let matched = "";
    for await (const entry of Deno.readDir(this.cwd)) {
      const candidate = join(this.cwd, entry.name);
      if (entry.isDirectory && regex.test(candidate)) {
        matched = candidate;
        break;
      }
    }
    assert(matched.length > 0, `expected pre-restore directory matching ${expected}`);
    this.preRestorePath = matched;
  },
);

Then("the pre-restore directory contains {string}", async function (this: ZenWorld, file: string) {
  await ensurePreRestorePath(this);
  assertEquals(await exists(join(this.preRestorePath, file)), true);
});

Then("the pre-restore directory still exists", async function (this: ZenWorld) {
  await ensurePreRestorePath(this);
  assertEquals(await exists(this.preRestorePath), true);
});

Then("the pre-restore directory is not empty", async function (this: ZenWorld) {
  await ensurePreRestorePath(this);
  let count = 0;
  for await (const _entry of Deno.readDir(this.preRestorePath)) {
    count += 1;
  }
  assert(count > 0, "expected non-empty pre-restore directory");
});

Then("the profile directory is unchanged", async function (this: ZenWorld) {
  const current = await snapshotProfile(this.profileDir);
  assertEquals(JSON.stringify(current), JSON.stringify(this.profileBeforeRestore));
});

Then("no pre-restore directory is created", async function (this: ZenWorld) {
  const dirs: string[] = [];
  for await (const entry of Deno.readDir(this.cwd)) {
    if (entry.isDirectory && entry.name.includes(".pre-restore-")) {
      dirs.push(entry.name);
    }
  }
  assertEquals(dirs.length, 0);
});

Then(
  "{string} in the profile contains {string}",
  async function (this: ZenWorld, file: string, value: string) {
    const content = await Deno.readTextFile(join(this.profileDir, file));
    assertStringIncludes(content, value);
  },
);

Then(
  "files are extracted to the profile directory, not absolute paths",
  async function (this: ZenWorld) {
    const files = await listFiles(this.profileDir);
    assert(files.some((file) => file.endsWith(".sqlite")), "expected sqlite extracted to profile");
    if (this.absoluteArchiveSourcePath) {
      assertEquals(await exists(this.absoluteArchiveSourcePath), true);
    }
  },
);

Then("stdout contains the archive path", function (this: ZenWorld) {
  assertStringIncludes(this.stdout, this.restoreArchiveName);
});

Then("stderr contains {string}", function (this: ZenWorld, expected: string) {
  assertStringIncludes(this.stderr, expected);
});

async function runRestoreCommand(world: ZenWorld, archive: string): Promise<void> {
  const result = await runCli(["restore", archive], {
    cwd: world.cwd,
    os: "darwin",
    now: world.now,
    env: {
      ...world.env,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });
  world.stdout = result.stdout;
  world.stderr = result.stderr;
  world.exitCode = result.exitCode;
}

async function ensureRestoreWorkspace(world: ZenWorld): Promise<void> {
  world.profileDir = world.profileDir || join(world.cwd, "profile");
  world.backupDir = world.backupDir || join(world.cwd, "backups");
  world.env.ZEN_BACKUP_CONFIG = "custom/settings.toml";
  await Deno.mkdir(world.profileDir, { recursive: true });
  await Deno.mkdir(world.backupDir, { recursive: true });
  await Deno.mkdir(world.resolvePath("custom"), { recursive: true });
  await Deno.writeTextFile(
    world.resolvePath("custom/settings.toml"),
    `[profile]\npath = ${toTomlStringLiteral(world.profileDir)}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(world.backupDir)
    }\n`,
  );
}

function archivePathForName(world: ZenWorld, name: string): string {
  const kind = name.includes("weekly") ? "weekly" : "daily";
  return join(world.backupDir, kind, name);
}

async function writeArchiveFromEntries(
  path: string,
  entries: Record<string, string>,
): Promise<void> {
  const staging = await Deno.makeTempDir();
  for (const [file, content] of Object.entries(entries)) {
    const fullPath = join(staging, file);
    await Deno.mkdir(dirname(fullPath), { recursive: true });
    if (file.endsWith(".sqlite")) {
      await createSqliteDb(fullPath);
    } else {
      await Deno.writeTextFile(fullPath, content);
    }
  }
  await Deno.mkdir(dirname(path), { recursive: true });
  const out = await new Deno.Command("tar", {
    args: ["-czf", path, "-C", staging, "."],
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
      "CREATE TABLE IF NOT EXISTS moz_places(id INTEGER PRIMARY KEY, url TEXT);" +
      "CREATE TABLE IF NOT EXISTS moz_bookmarks(id INTEGER PRIMARY KEY, place_id INTEGER);" +
      "INSERT INTO moz_places(url) VALUES('https://example.com');" +
      "INSERT INTO moz_bookmarks(place_id) VALUES(1);",
    ],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function writeProfileFixture(
  root: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = join(root, relativePath);
  await Deno.mkdir(dirname(fullPath), { recursive: true });
  await Deno.writeTextFile(fullPath, content);
}

async function snapshotProfile(profileDir: string): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const file of await listFiles(profileDir)) {
    snapshot[file] = await Deno.readTextFile(join(profileDir, file)).catch(() => "");
  }
  return snapshot;
}

async function listFiles(root: string, relative = ""): Promise<string[]> {
  const files: string[] = [];
  const dir = relative ? join(root, relative) : root;
  for await (const entry of Deno.readDir(dir)) {
    const childRel = relative ? join(relative, entry.name) : entry.name;
    const childFull = join(root, childRel);
    if (entry.isDirectory) {
      files.push(...await listFiles(root, childRel));
    } else if (entry.isFile) {
      files.push(childRel);
    }
    if (!entry.isDirectory && !entry.isFile) {
      await Deno.stat(childFull).catch(() => undefined);
    }
  }
  return files;
}

async function ensurePreRestorePath(world: ZenWorld): Promise<void> {
  if (world.preRestorePath) return;
  for await (const entry of Deno.readDir(world.cwd)) {
    if (entry.isDirectory && entry.name.includes(".pre-restore-")) {
      world.preRestorePath = join(world.cwd, entry.name);
      return;
    }
  }
  throw new Error("pre-restore directory not found");
}

async function sqliteQuery(dbPath: string, sql: string): Promise<string> {
  const out = await new Deno.Command("sqlite3", {
    args: [dbPath, sql],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
  return new TextDecoder().decode(out.stdout);
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
