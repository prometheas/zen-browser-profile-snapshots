import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("status shows not installed when config is missing", async () => {
  const tempDir = await Deno.makeTempDir();

  const result = await runCli(["status"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Not installed");
  assertStringIncludes(result.stdout, "zen-backup install");
});

Deno.test("backup command loads overridden config path", async () => {
  const tempDir = await Deno.makeTempDir();
  const configDir = `${tempDir}/custom`;
  const profileDir = `${tempDir}/profile`;

  await Deno.mkdir(configDir, { recursive: true });
  await Deno.mkdir(profileDir, { recursive: true });

  const configPath = `${configDir}/settings.toml`;
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${tempDir}/backups"\n`,
  );

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Created daily backup");
});

Deno.test("status shows latest daily and weekly backups with disk usage", async () => {
  const tempDir = await Deno.makeTempDir();
  const backupDir = join(tempDir, "backups");
  const profileDir = join(tempDir, "profile");
  const configDir = join(tempDir, "custom");
  await Deno.mkdir(join(backupDir, "daily"), { recursive: true });
  await Deno.mkdir(join(backupDir, "weekly"), { recursive: true });
  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.writeFile(join(backupDir, "daily", "zen-backup-daily-2026-01-14.tar.gz"), new Uint8Array(2048));
  await Deno.writeFile(join(backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz"), new Uint8Array(3072));
  await Deno.writeFile(join(backupDir, "weekly", "zen-backup-weekly-2026-01-12.tar.gz"), new Uint8Array(1024));
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );

  const result = await runCli(["status"], {
    cwd: tempDir,
    os: "darwin",
    now: new Date("2026-01-16T00:00:00Z"),
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Latest daily: zen-backup-daily-2026-01-15.tar.gz");
  assertStringIncludes(result.stdout, "Latest weekly: zen-backup-weekly-2026-01-12.tar.gz");
  assertStringIncludes(result.stdout, "Disk usage total:");
  assertStringIncludes(result.stdout, "Disk usage daily:");
  assertStringIncludes(result.stdout, "Disk usage weekly:");
});

Deno.test("status reports active scheduled jobs marker and stale warning", async () => {
  const tempDir = await Deno.makeTempDir();
  const backupDir = join(tempDir, "backups");
  const profileDir = join(tempDir, "profile");
  const configDir = join(tempDir, "custom");
  const agentsDir = join(tempDir, "Library", "LaunchAgents");
  await Deno.mkdir(join(backupDir, "daily"), { recursive: true });
  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(configDir, { recursive: true });
  await Deno.mkdir(agentsDir, { recursive: true });
  await Deno.writeFile(join(backupDir, "daily", "zen-backup-daily-2026-01-01.tar.gz"), new Uint8Array(1024));
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.daily.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.weekly.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  await Deno.writeTextFile(
    join(configDir, "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );

  const result = await runCli(["status"], {
    cwd: tempDir,
    os: "darwin",
    now: new Date("2026-01-20T00:00:00Z"),
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Warning: latest daily backup is stale.");
  assertStringIncludes(result.stdout, "Scheduled jobs: active");
  assertStringIncludes(result.stdout, "com.prometheas.zen-backup.daily");
});
