import { Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { DataTable } from "npm:@cucumber/cucumber@12.6.0";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../../src/main.ts";
import { ZenWorld } from "../support/world.ts";

Given("a profile directory containing:", async function (this: ZenWorld, table: DataTable) {
  this.profileDir = join(this.cwd, "profile");
  this.backupDir = join(this.cwd, "backups");

  await Deno.mkdir(this.profileDir, { recursive: true });

  const rows = table.hashes();
  for (const row of rows) {
    const path = row.file;
    const content = row.content;
    const fullPath = join(this.profileDir, path);
    await Deno.mkdir(dirname(fullPath), { recursive: true });
    await Deno.writeTextFile(fullPath, content);
  }

  await writeConfig(this, this.profileDir, this.backupDir);
});

Given("a backup directory exists at the configured path", async function (this: ZenWorld) {
  if (!this.backupDir) {
    this.backupDir = join(this.cwd, "backups");
  }
  await Deno.mkdir(this.backupDir, { recursive: true });
});

When("a daily backup is created", async function (this: ZenWorld) {
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: "darwin",
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
  const result = await runCli(["backup", "weekly"], {
    cwd: this.cwd,
    os: "darwin",
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

Given("the configured profile path does not exist", async function (this: ZenWorld) {
  this.missingProfilePath = join(this.cwd, "missing-profile");
  this.backupDir = join(this.cwd, "backups");
  await writeConfig(this, this.missingProfilePath, this.backupDir);
});

When("a daily backup is attempted", async function (this: ZenWorld) {
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: "darwin",
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

Then("an archive exists matching pattern {string}", async function (this: ZenWorld, pattern: string) {
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
});

Then("the archive is in the {string} subdirectory", function (this: ZenWorld, subdirectory: string) {
  assertStringIncludes(this.lastArchivePath, `/${subdirectory}/`);
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

async function writeConfig(world: ZenWorld, profilePath: string, backupPath: string): Promise<void> {
  const configPath = world.resolvePath("custom/settings.toml");
  await Deno.mkdir(dirname(configPath), { recursive: true });
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = "${profilePath}"\n\n[backup]\nlocal_path = "${backupPath}"\n`,
  );
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
