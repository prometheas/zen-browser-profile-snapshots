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
    env: { HOME: tempDir, ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER: "1" },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Detected profile path");
  assertStringIncludes(result.stderr, "terminal-notifier");

  const configPath = join(tempDir, ".config", "zen-profile-backup", "settings.toml");
  const dailyPlist = join(tempDir, "Library", "LaunchAgents", "com.prometheas.zen-backup.daily.plist");
  const weeklyPlist = join(tempDir, "Library", "LaunchAgents", "com.prometheas.zen-backup.weekly.plist");
  assertEquals(await exists(configPath), true);
  assertEquals(await exists(dailyPlist), true);
  assertEquals(await exists(weeklyPlist), true);

  const dailyContent = await Deno.readTextFile(dailyPlist);
  assertEquals(dailyContent.includes("$HOME"), false);
  assertStringIncludes(dailyContent, tempDir);
});

Deno.test("uninstall removes schedule and settings, and preserves backups by default", async () => {
  const tempDir = await Deno.makeTempDir();
  const profilePath = join(tempDir, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.mkdir(profilePath, { recursive: true });
  await runCli(["install"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  await Deno.mkdir(join(tempDir, "zen-backups", "daily"), { recursive: true });
  await Deno.writeTextFile(join(tempDir, "zen-backups", "daily", "zen-backup-daily-2026-01-15.tar.gz"), "x");

  const result = await runCli(["uninstall"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stderr, "--purge-backups");

  const configPath = join(tempDir, ".config", "zen-profile-backup", "settings.toml");
  const dailyPlist = join(tempDir, "Library", "LaunchAgents", "com.prometheas.zen-backup.daily.plist");
  assertEquals(await exists(configPath), false);
  assertEquals(await exists(dailyPlist), false);
  assertEquals(await exists(join(tempDir, "zen-backups", "daily", "zen-backup-daily-2026-01-15.tar.gz")), true);
});

Deno.test("schedule start/stop/status and aliases work", async () => {
  const tempDir = await Deno.makeTempDir();
  const profilePath = join(tempDir, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.mkdir(profilePath, { recursive: true });
  await runCli(["install"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });

  const stop = await runCli(["schedule", "stop"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(stop.exitCode, 0);
  assertStringIncludes(stop.stdout, "stopped");
  assertStringIncludes(stop.stdout, "paused");

  const resume = await runCli(["schedule", "resume"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(resume.exitCode, 0);
  assertStringIncludes(resume.stdout, "started");
  assertStringIncludes(resume.stdout, "active");

  const pauseAlias = await runCli(["schedule", "pause"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(pauseAlias.exitCode, 0);
  assertStringIncludes(pauseAlias.stdout, "paused");

  const startAlias = await runCli(["schedule", "start"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(startAlias.exitCode, 0);
  assertStringIncludes(startAlias.stdout, "active");

  const status = await runCli(["schedule", "status"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(status.exitCode, 0);
  assertStringIncludes(status.stdout, "com.prometheas.zen-backup.daily");
});

Deno.test("schedule start/stop are idempotent", async () => {
  const tempDir = await Deno.makeTempDir();
  const profilePath = join(tempDir, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.mkdir(profilePath, { recursive: true });
  await runCli(["install"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });

  const firstStop = await runCli(["schedule", "stop"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(firstStop.exitCode, 0);
  assertStringIncludes(firstStop.stdout, "paused");

  const secondStop = await runCli(["schedule", "stop"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(secondStop.exitCode, 0);
  assertStringIncludes(secondStop.stdout, "paused");

  const firstStart = await runCli(["schedule", "start"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(firstStart.exitCode, 0);
  assertStringIncludes(firstStart.stdout, "active");

  const secondStart = await runCli(["schedule", "start"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(secondStart.exitCode, 0);
  assertStringIncludes(secondStart.stdout, "active");
});

Deno.test("schedule status reports no jobs before install", async () => {
  const tempDir = await Deno.makeTempDir();
  const result = await runCli(["schedule", "status"], { cwd: tempDir, os: "darwin", env: { HOME: tempDir } });
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "No scheduled jobs");
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
