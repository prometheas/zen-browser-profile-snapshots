import { assert, assertEquals, assertMatch, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("backup daily creates tar.gz in daily subdirectory", async () => {
  const { tempDir, profileDir, backupDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "places.sqlite"), "data");

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
  await Deno.writeTextFile(join(profileDir, "places.sqlite"), "data");

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

Deno.test("backup excludes security-sensitive and cache files", async () => {
  const { tempDir, profileDir } = await createWorkspace();
  await Deno.writeTextFile(join(profileDir, "places.sqlite"), "ok");
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

async function pathExists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
