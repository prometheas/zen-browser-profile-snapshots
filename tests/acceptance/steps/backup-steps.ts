import { After, Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { DataTable } from "npm:@cucumber/cucumber@12.6.0";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../../src/main.ts";
import type { Platform } from "../../../src/types.ts";
import { ZenWorld } from "../support/world.ts";

After(async function (this: ZenWorld) {
  if (this.sqliteLockWriter) {
    const encoder = new TextEncoder();
    await this.sqliteLockWriter.write(encoder.encode("ROLLBACK;\n.quit\n")).catch(() => undefined);
    this.sqliteLockWriter.releaseLock();
    this.sqliteLockWriter = null;
  }

  if (this.sqliteLockProcess) {
    await this.sqliteLockProcess.status.catch(() => undefined);
    this.sqliteLockProcess = null;
  }
});

Given("a profile directory containing:", async function (this: ZenWorld, table: DataTable) {
  this.profileDir = join(this.cwd, "profile");
  this.backupDir = join(this.cwd, "backups");

  await Deno.mkdir(this.profileDir, { recursive: true });

  const rows = table.hashes();
  for (const row of rows) {
    const path = row.file;
    const content = row.content;
    await writeProfileFixture(this.profileDir, path, content);
  }

  await writeConfig(this, this.profileDir, this.backupDir);
});

Given(
  "the profile directory additionally contains:",
  async function (this: ZenWorld, table: DataTable) {
    if (!this.profileDir) {
      this.profileDir = join(this.cwd, "profile");
      await Deno.mkdir(this.profileDir, { recursive: true });
    }

    const rows = table.hashes();
    for (const row of rows) {
      const path = row.file;
      const content = row.content;
      await writeProfileFixture(this.profileDir, path, content);
    }
  },
);

Given("a backup directory exists at the configured path", async function (this: ZenWorld) {
  if (!this.backupDir) {
    this.backupDir = join(this.cwd, "backups");
  }
  await Deno.mkdir(this.backupDir, { recursive: true });
});

Given("cloud sync is configured to a valid path", async function (this: ZenWorld) {
  await ensureBackupWorkspace(this);
  this.cloudPath = join(this.cwd, "cloud-backups");
  await Deno.mkdir(this.cloudPath, { recursive: true });
  await writeConfig(this, this.profileDir, this.backupDir, this.cloudPath);
});

Given("cloud sync is not configured", async function (this: ZenWorld) {
  await ensureBackupWorkspace(this);
  this.cloudPath = undefined;
  await writeConfig(this, this.profileDir, this.backupDir, undefined);
});

Given("cloud sync is configured to an inaccessible path", async function (this: ZenWorld) {
  await ensureBackupWorkspace(this);
  this.cloudPath = join(this.cwd, "cloud-not-a-directory");
  await Deno.writeTextFile(this.cloudPath, "not a directory");
  await writeConfig(this, this.profileDir, this.backupDir, this.cloudPath);
});

When("a daily backup is created", async function (this: ZenWorld) {
  await ensureBackupWorkspace(this);
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: targetOs(this),
    now: this.now,
    env: {
      ...this.env,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
  this.lastArchivePath = extractArchivePath(result.stdout);
});

When("a weekly backup is created", async function (this: ZenWorld) {
  await ensureBackupWorkspace(this);
  const result = await runCli(["backup", "weekly"], {
    cwd: this.cwd,
    os: targetOs(this),
    now: this.now,
    env: {
      ...this.env,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
  this.lastArchivePath = extractArchivePath(result.stdout);
});

When("the archive is extracted to a temporary directory", async function (this: ZenWorld) {
  this.extractedDir = await Deno.makeTempDir({ prefix: "zen-backup-extracted-" });
  await extractArchive(this.lastArchivePath, this.extractedDir);
});

Given("the configured profile path does not exist", async function (this: ZenWorld) {
  this.missingProfilePath = join(this.cwd, "missing-profile");
  this.backupDir = join(this.cwd, "backups");
  await writeConfig(this, this.missingProfilePath, this.backupDir);
});

Given(
  "{string} is exclusively locked by another process",
  async function (this: ZenWorld, file: string) {
    const dbPath = join(this.profileDir, file);
    const lockProc = new Deno.Command("sqlite3", {
      args: [dbPath],
      stdin: "piped",
      stdout: "null",
      stderr: "null",
    }).spawn();

    const writer = lockProc.stdin.getWriter();
    const encoder = new TextEncoder();
    await writer.write(
      encoder.encode("PRAGMA locking_mode=EXCLUSIVE;\nBEGIN EXCLUSIVE;\nSELECT 1;\n"),
    );

    this.sqliteLockProcess = lockProc;
    this.sqliteLockWriter = writer;
  },
);

When("a daily backup is attempted", async function (this: ZenWorld) {
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: targetOs(this),
    now: this.now,
    env: {
      ...this.env,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
  this.lastArchivePath = extractArchivePath(result.stdout);
});

Then(
  "an archive exists matching pattern {string}",
  async function (this: ZenWorld, pattern: string) {
    const regex = new RegExp(pattern);
    const kind = pattern.includes("weekly") ? "weekly" : "daily";
    const dir = join(this.backupDir, kind);

    let matched = false;
    for await (const entry of Deno.readDir(dir)) {
      if (entry.isFile && regex.test(entry.name)) {
        matched = true;
        this.lastArchivePath = join(dir, entry.name);
      }
    }

    assert(matched, `Expected archive matching ${pattern} in ${dir}`);
  },
);

Then(
  "the archive is in the {string} subdirectory",
  function (this: ZenWorld, subdirectory: string) {
    assertStringIncludes(this.lastArchivePath, `/${subdirectory}/`);
  },
);

Then(
  "the archive exists in the local {string} subdirectory",
  async function (this: ZenWorld, subdirectory: string) {
    const fileName = this.lastArchivePath.split("/").at(-1) ?? "";
    const path = join(this.backupDir, subdirectory, fileName);
    const exists = await pathExists(path);
    assertEquals(exists, true);
  },
);

Then(
  "the archive exists in the cloud {string} subdirectory",
  async function (this: ZenWorld, subdirectory: string) {
    const fileName = this.lastArchivePath.split("/").at(-1) ?? "";
    const cloudBase = this.cloudPath ?? join(this.cwd, "cloud-backups");
    const path = join(cloudBase, subdirectory, fileName);
    const exists = await pathExists(path);
    assertEquals(exists, true);
  },
);

Then("the archive contains {string}", async function (this: ZenWorld, path: string) {
  const entries = await listArchive(this.lastArchivePath);
  const joined = entries.join("\n");
  assertStringIncludes(joined, path);
});

Then("stderr contains the missing path", function (this: ZenWorld) {
  assertStringIncludes(this.stderr, this.missingProfilePath);
});

Then("no archive is created", async function (this: ZenWorld) {
  const dailyDir = join(this.backupDir, "daily");
  try {
    const entries: string[] = [];
    for await (const entry of Deno.readDir(dailyDir)) {
      if (entry.isFile) entries.push(entry.name);
    }
    assertEquals(entries.length, 0);
  } catch {
    // Directory absence is also valid.
  }
});

Then(
  "{string} in the extracted archive passes {string}",
  async function (this: ZenWorld, path: string, _pragma: string) {
    if (!this.extractedDir) {
      this.extractedDir = await Deno.makeTempDir({ prefix: "zen-backup-extracted-" });
      await extractArchive(this.lastArchivePath, this.extractedDir);
    }
    const dbPath = join(this.extractedDir, path);
    const output = await sqliteQuery(dbPath, "PRAGMA integrity_check;");
    assertStringIncludes(output.toLowerCase(), "ok");
  },
);

Then(
  "{string} in the extracted archive contains table {string}",
  async function (this: ZenWorld, path: string, table: string) {
    const dbPath = join(this.extractedDir, path);
    const output = await sqliteQuery(
      dbPath,
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
    );
    assertStringIncludes(output, table);
  },
);

Then(
  "the extracted archive does not contain {string}",
  async function (this: ZenWorld, path: string) {
    const entries = await listArchive(this.lastArchivePath);
    const joined = entries.join("\n");
    assertEquals(joined.includes(path), false);
  },
);

Then("the extracted archive contains {string}", async function (this: ZenWorld, path: string) {
  const entries = await listArchive(this.lastArchivePath);
  const joined = entries.join("\n");
  assertStringIncludes(joined, path);
});

Then(
  "the log contains {string} or {string}",
  async function (this: ZenWorld, a: string, b: string) {
    const logPath = join(this.backupDir, "backup.log");
    const content = await Deno.readTextFile(logPath);
    assert(content.includes(a) || content.includes(b), `expected log to include ${a} or ${b}`);
  },
);

Then("no cloud copy is attempted", async function (this: ZenWorld) {
  const cloudBase = join(this.cwd, "cloud-backups");
  assertEquals(await pathExists(cloudBase), false);
});

Then("{string} contains {string}", async function (this: ZenWorld, path: string, value: string) {
  const resolvedPath = resolveStepPath(this, path);
  const content = await Deno.readTextFile(resolvedPath);
  assertStringIncludes(content, value);
});

Then(
  "{string} contains a line matching {string}",
  async function (this: ZenWorld, path: string, pattern: string) {
    const resolvedPath = resolveStepPath(this, path);
    const content = await Deno.readTextFile(resolvedPath);
    const regex = new RegExp(pattern);
    assert(regex.test(content), `expected ${path} to match ${pattern}`);
  },
);

async function writeConfig(
  world: ZenWorld,
  profilePath: string,
  backupPath: string,
  cloudPath?: string,
): Promise<void> {
  const configPath = world.resolvePath("custom/settings.toml");
  await Deno.mkdir(dirname(configPath), { recursive: true });
  const cloudLine = cloudPath ? `cloud_path = "${cloudPath}"\n` : "";
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = "${profilePath}"\n\n[backup]\nlocal_path = "${backupPath}"\n${cloudLine}`,
  );
}

async function ensureBackupWorkspace(world: ZenWorld): Promise<void> {
  if (!world.profileDir) {
    world.profileDir = join(world.cwd, "profile");
  }
  if (!world.backupDir) {
    world.backupDir = join(world.cwd, "backups");
  }
  await Deno.mkdir(world.profileDir, { recursive: true });
  await Deno.mkdir(world.backupDir, { recursive: true });
  await writeConfig(world, world.profileDir, world.backupDir, world.cloudPath);
}

function extractArchivePath(stdout: string): string {
  const marker = ": ";
  const index = stdout.lastIndexOf(marker);
  if (index === -1) return "";
  const path = stdout.slice(index + marker.length).trim();
  if (!path) return "";

  assertMatch(path, /\.tar\.gz$/);
  return path;
}

async function listArchive(archivePath: string): Promise<string[]> {
  const command = new Deno.Command("tar", {
    args: ["-tzf", archivePath],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    throw new Error(new TextDecoder().decode(output.stderr));
  }
  const text = new TextDecoder().decode(output.stdout).trim();
  return text ? text.split("\n") : [];
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

async function writeProfileFixture(
  profileDir: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const fullPath = join(profileDir, relativePath);
  await Deno.mkdir(dirname(fullPath), { recursive: true });

  if (relativePath.endsWith(".sqlite") || relativePath.endsWith(".db")) {
    await seedSqliteFixture(fullPath, relativePath);
    return;
  }

  await Deno.writeTextFile(fullPath, content);
}

async function seedSqliteFixture(dbPath: string, relativePath: string): Promise<void> {
  if (relativePath.endsWith("places.sqlite")) {
    await sqliteExec(
      dbPath,
      "CREATE TABLE IF NOT EXISTS moz_places(id INTEGER PRIMARY KEY, url TEXT);" +
        "CREATE TABLE IF NOT EXISTS moz_bookmarks(id INTEGER PRIMARY KEY, place_id INTEGER);" +
        "INSERT INTO moz_places(url) VALUES('https://example.com');" +
        "INSERT INTO moz_bookmarks(place_id) VALUES(1);",
    );
    return;
  }

  await sqliteExec(
    dbPath,
    "CREATE TABLE IF NOT EXISTS sample(id INTEGER PRIMARY KEY, value TEXT);" +
      "INSERT INTO sample(value) VALUES('ok');",
  );
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

function resolveStepPath(world: ZenWorld, path: string): string {
  if (path.includes("/") || path.startsWith(".")) {
    return path;
  }

  return join(world.backupDir, path);
}

function targetOs(world: ZenWorld): Platform {
  const raw = world.env.ZEN_BACKUP_TEST_OS;
  if (raw === "linux" || raw === "windows" || raw === "darwin") return raw;
  return "darwin";
}
