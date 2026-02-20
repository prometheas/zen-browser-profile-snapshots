import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("install writes config and macOS launchd plists", async () => {
  const tempDir = await Deno.makeTempDir();
  const profilePath = join(tempDir, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.mkdir(profilePath, { recursive: true });

  const result = await runCli(["install"], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Detected profile path");

  const configPath = join(tempDir, ".config", "zen-profile-backup", "settings.toml");
  const dailyPlist = join(tempDir, "Library", "LaunchAgents", "com.zen-backup.daily.plist");
  const weeklyPlist = join(tempDir, "Library", "LaunchAgents", "com.zen-backup.weekly.plist");
  assertEquals(await exists(configPath), true);
  assertEquals(await exists(dailyPlist), true);
  assertEquals(await exists(weeklyPlist), true);

  const dailyContent = await Deno.readTextFile(dailyPlist);
  assertEquals(dailyContent.includes("$HOME"), false);
  assertStringIncludes(dailyContent, tempDir);
});

Deno.test("uninstall removes launchd agents and preserves settings", async () => {
  const tempDir = await Deno.makeTempDir();
  const profilePath = join(tempDir, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.mkdir(profilePath, { recursive: true });
  await runCli(["install"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });

  const result = await runCli(["uninstall"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(result.exitCode, 0);

  const configPath = join(tempDir, ".config", "zen-profile-backup", "settings.toml");
  const dailyPlist = join(tempDir, "Library", "LaunchAgents", "com.zen-backup.daily.plist");
  assertEquals(await exists(configPath), true);
  assertEquals(await exists(dailyPlist), false);
});

Deno.test("backup writes notifications when browser running and cloud sync fails", async () => {
  const tempDir = await Deno.makeTempDir();
  const profileDir = join(tempDir, "profile");
  const backupDir = join(tempDir, "backups");
  const configDir = join(tempDir, "custom");
  const cloudPathFile = join(tempDir, "cloud-file");

  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeTextFile(cloudPathFile, "not a dir");
  await createSqliteDb(join(profileDir, "places.sqlite"));
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\ncloud_path = "${cloudPathFile}"\n\n[notifications]\nenabled = true\n`,
  );

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
      ZEN_BACKUP_BROWSER_RUNNING: "1",
    },
  });
  assertEquals(result.exitCode, 1);

  const notifications = await Deno.readTextFile(join(backupDir, "notifications.log"));
  assertStringIncludes(notifications, "Zen Backup");
  assertStringIncludes(notifications, "browser is running");
  assertStringIncludes(notifications, "Zen Backup Warning");
  assertStringIncludes(notifications, "cloud sync failed");
});

async function createSqliteDb(path: string): Promise<void> {
  const out = await new Deno.Command("sqlite3", {
    args: [path, "CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t(v) VALUES('x');"],
    stdout: "null",
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(new TextDecoder().decode(out.stderr));
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
