import { Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../../src/main.ts";
import { ZenWorld } from "../support/world.ts";

Given("a Zen profile exists at {string}", async function (this: ZenWorld, path: string) {
  const resolved = expandKnownPath(this, path);
  await Deno.mkdir(resolved, { recursive: true });
});

Given("no Zen profile is detected", async function (this: ZenWorld) {
  const path = join(this.cwd, "Library", "Application Support", "zen", "Profiles", "default");
  await Deno.remove(path, { recursive: true }).catch(() => undefined);
});

Given("Google Drive is mounted at {string}", async function (this: ZenWorld, path: string) {
  await Deno.mkdir(expandKnownPath(this, path), { recursive: true });
});

Given("iCloud Drive is available at {string}", async function (this: ZenWorld, path: string) {
  await Deno.mkdir(expandKnownPath(this, path), { recursive: true });
});

Given("OneDrive is mounted at {string}", async function (this: ZenWorld, path: string) {
  await Deno.mkdir(expandKnownPath(this, path), { recursive: true });
});

Given("Dropbox is available at the platform-standard location", async function (this: ZenWorld) {
  await Deno.mkdir(join(this.cwd, "Dropbox"), { recursive: true });
});

Given("the install command is running", function () {
  // declarative
});

Given("the user completes the install wizard", async function (this: ZenWorld) {
  await runInstall(this);
});

Given("settings.toml exists", async function (this: ZenWorld) {
  const path = join(this.cwd, ".config", "zen-profile-backup", "settings.toml");
  await Deno.mkdir(join(this.cwd, ".config", "zen-profile-backup"), { recursive: true });
  await Deno.writeTextFile(
    path,
    '[profile]\npath = "profile"\n\n[backup]\nlocal_path = "backups"\n',
  );
});

Given("backup archives exist in the backup directory", async function (this: ZenWorld) {
  const backupDir = join(this.cwd, "zen-backups", "daily");
  await Deno.mkdir(backupDir, { recursive: true });
  await Deno.writeTextFile(join(backupDir, "zen-backup-daily-2026-01-15.tar.gz"), "data");
});

Given("the user does not have write permission to the config directory", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_SIMULATE_CONFIG_PERMISSION_DENIED = "1";
});

Given("the user enters a non-existent profile path", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_PROFILE_PATH = join(this.cwd, "does-not-exist");
  this.env.ZEN_BACKUP_VALIDATE_ONLY = "1";
});

Given("terminal-notifier is not installed", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER = "1";
});

Given("the launchd agent {string} is loaded", async function (this: ZenWorld, _label: string) {
  await ensurePlatformConfig(this);
  const agentsDir = join(this.cwd, "Library", "LaunchAgents");
  await Deno.mkdir(agentsDir, { recursive: true });
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.daily.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.weekly.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
});

Given("the launchd agents are loaded", async function (this: ZenWorld) {
  await ensurePlatformConfig(this);
  const agentsDir = join(this.cwd, "Library", "LaunchAgents");
  await Deno.mkdir(agentsDir, { recursive: true });
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.daily.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.weekly.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
});

Given("no launchd agents are loaded", async function (this: ZenWorld) {
  await ensurePlatformConfig(this);
  const agentsDir = join(this.cwd, "Library", "LaunchAgents");
  await Deno.remove(join(agentsDir, "com.prometheas.zen-backup.daily.plist")).catch(() =>
    undefined
  );
  await Deno.remove(join(agentsDir, "com.prometheas.zen-backup.weekly.plist")).catch(() =>
    undefined
  );
  await Deno.remove(join(agentsDir, ".zen-backup-loaded")).catch(() => undefined);
});

Given(
  "notifications are disabled in configuration \\(notifications.enabled = false\\)",
  async function (this: ZenWorld) {
    const profileDir = join(this.cwd, "profile");
    const backupDir = join(this.cwd, "backups");
    await Deno.mkdir(profileDir, { recursive: true });
    await Deno.mkdir(backupDir, { recursive: true });
    await createSqliteDb(join(profileDir, "places.sqlite"));
    await Deno.writeTextFile(
      join(this.cwd, "custom-settings.toml"),
      `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n\n[notifications]\nenabled = false\n`,
    );
    this.env.ZEN_BACKUP_CONFIG = "custom-settings.toml";
  },
);

When("the install command is run", async function (this: ZenWorld) {
  await runInstall(this);
});

When("the uninstall command is run", async function (this: ZenWorld) {
  const result = await runCli(["uninstall"], {
    cwd: this.cwd,
    os: "darwin",
    env: this.envWithHome(),
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

When("the installer finishes", function () {
  // command already completed
});

When("the installer validates the path", async function (this: ZenWorld) {
  await runInstall(this);
});

When("the user selects {string}", async function (this: ZenWorld, choice: string) {
  if (choice.includes("local only")) {
    this.env.ZEN_BACKUP_CLOUD = "none";
  }
  await runInstall(this);
});

When("the scheduler is queried", async function (this: ZenWorld) {
  const result = await runCli(["status"], {
    cwd: this.cwd,
    os: "darwin",
    env: this.envWithHome(),
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

When("the scheduled time 12:30 is reached", async function (this: ZenWorld) {
  const profileDir = join(this.cwd, "profile");
  const backupDir = join(this.cwd, "backups");
  await Deno.mkdir(profileDir, { recursive: true });
  await createSqliteDb(join(profileDir, "places.sqlite"));
  await Deno.mkdir(join(this.cwd, "custom"), { recursive: true });
  await Deno.writeTextFile(
    join(this.cwd, "custom", "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: "darwin",
    env: { ...this.envWithHome(), ZEN_BACKUP_CONFIG: "custom/settings.toml" },
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

When("a daily backup is created on macos", async function (this: ZenWorld) {
  await ensurePlatformConfig(this);
  await createSqliteDb(join(this.cwd, "profile", "places.sqlite"));
  const result = await runCli(["backup", "daily"], {
    cwd: this.cwd,
    os: "darwin",
    env: this.envWithHome(),
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

Then("the installer detects and displays the profile path", function (this: ZenWorld) {
  assertStringIncludes(this.stdout, "Detected profile path");
});

Then("the user is not required to enter the path manually", function (this: ZenWorld) {
  assertStringIncludes(this.stdout, "not required");
});

Then("the installer prompts for the profile path", function (this: ZenWorld) {
  assertStringIncludes(this.stdout.toLowerCase(), "please enter profile path");
});

Then("the user can enter a custom path", function (this: ZenWorld) {
  assertStringIncludes(this.stdout.toLowerCase(), "custom path");
});

Then("the installer prompts for backup directory", function (this: ZenWorld) {
  assertStringIncludes(this.stdout.toLowerCase(), "default backup directory");
});

Then("the default is suggested based on platform", function (this: ZenWorld) {
  assertStringIncludes(this.stdout.toLowerCase(), "default backup directory");
});

Then("the default backup directory is {string}", function (this: ZenWorld, expected: string) {
  const resolved = expandKnownPath(this, expected);
  assertStringIncludes(this.stdout, resolved);
});

Then("{string} appears as a cloud sync option", function (this: ZenWorld, label: string) {
  assertStringIncludes(this.stdout, label);
});

Then("no cloud_path is written to settings.toml", async function (this: ZenWorld) {
  const path = join(this.cwd, ".config", "zen-profile-backup", "settings.toml");
  const text = await Deno.readTextFile(path);
  assertEquals(text.includes("cloud_path"), false);
});

Then("the installer continues to scheduling", function (this: ZenWorld) {
  assertStringIncludes(this.stdout.toLowerCase(), "scheduler");
});

Then(
  "a settings.toml file exists at the platform config location",
  async function (this: ZenWorld) {
    assertEquals(
      await exists(join(this.cwd, ".config", "zen-profile-backup", "settings.toml")),
      true,
    );
  },
);

Then("the file contains [profile] section", async function (this: ZenWorld) {
  await assertSettingsContains(this, "[profile]");
});

Then("the file contains [backup] section", async function (this: ZenWorld) {
  await assertSettingsContains(this, "[backup]");
});

Then("the file contains [retention] section", async function (this: ZenWorld) {
  await assertSettingsContains(this, "[retention]");
});

Then("{string} exists in {string}", async function (this: ZenWorld, file: string, folder: string) {
  const path = join(expandKnownPath(this, folder), normalizeLegacyName(file));
  assertEquals(await exists(path), true);
});

Then("the agents are loaded and enabled", async function (this: ZenWorld) {
  assertEquals(await exists(join(this.cwd, "Library", "LaunchAgents", ".zen-backup-loaded")), true);
});

Then("the plist files contain actual paths, not placeholders", async function (this: ZenWorld) {
  const daily = await Deno.readTextFile(
    join(this.cwd, "Library", "LaunchAgents", "com.prometheas.zen-backup.daily.plist"),
  );
  assertEquals(daily.includes("$HOME"), false);
});

Then(
  "{string} is removed from {string}",
  async function (this: ZenWorld, file: string, folder: string) {
    const path = join(expandKnownPath(this, folder), normalizeLegacyName(file));
    assertEquals(await exists(path), false);
  },
);

Then("the agents are unloaded", async function (this: ZenWorld) {
  assertEquals(
    await exists(join(this.cwd, "Library", "LaunchAgents", ".zen-backup-loaded")),
    false,
  );
});

Then("all backup archives still exist", async function (this: ZenWorld) {
  assertEquals(
    await exists(join(this.cwd, "zen-backups", "daily", "zen-backup-daily-2026-01-15.tar.gz")),
    true,
  );
});

Then("settings.toml still exists", async function (this: ZenWorld) {
  assertEquals(
    await exists(join(this.cwd, ".config", "zen-profile-backup", "settings.toml")),
    true,
  );
});

Then("settings.toml does not exist", async function (this: ZenWorld) {
  assertEquals(
    await exists(join(this.cwd, ".config", "zen-profile-backup", "settings.toml")),
    false,
  );
});

Then("the installer displays a permission error", function (this: ZenWorld) {
  assert(this.stderr.toLowerCase().includes("permission"), "expected permission error");
});

Then("suggests running with appropriate permissions", function (this: ZenWorld) {
  assert(this.stderr.toLowerCase().includes("permission"), "expected permission guidance");
});

Given("{string} was run", async function (this: ZenWorld, command: string) {
  await runLiteralCommand(this, command);
});

When("{string} is run", async function (this: ZenWorld, command: string) {
  await runLiteralCommand(this, command);
});

Then("a launchd agent {string} is loaded", function (this: ZenWorld, label: string) {
  assertStringIncludes(this.stdout, normalizeLegacyName(label).replace(".plist", ""));
});

Then(
  "the agent is configured to run at the configured daily_time \\(default: 12:30\\)",
  async function (this: ZenWorld) {
    const plist = await Deno.readTextFile(
      join(this.cwd, "Library", "LaunchAgents", "com.prometheas.zen-backup.daily.plist"),
    );
    assertStringIncludes(plist, "<integer>12</integer>");
    assertStringIncludes(plist, "<integer>30</integer>");
  },
);

Then(
  "the agent is configured to run at the configured weekly_day and weekly_time \\(default: Sunday {int}:{int})",
  async function (this: ZenWorld, hour: number, minute: number) {
    const plist = await Deno.readTextFile(
      join(this.cwd, "Library", "LaunchAgents", "com.prometheas.zen-backup.weekly.plist"),
    );
    assertStringIncludes(plist, "<key>Weekday</key>");
    assertStringIncludes(plist, `<integer>${hour}</integer>`);
    assertStringIncludes(plist, `<integer>${minute}</integer>`);
  },
);

Then(
  "{string} is replaced with the user's home directory",
  async function (this: ZenWorld, token: string) {
    const plist = await Deno.readTextFile(
      join(this.cwd, "Library", "LaunchAgents", "com.prometheas.zen-backup.daily.plist"),
    );
    assertEquals(plist.includes(token), false);
    assertStringIncludes(plist, this.cwd);
  },
);

Then("a daily backup archive is created", async function (this: ZenWorld) {
  const dailyDir = join(this.cwd, "backups", "daily");
  let count = 0;
  for await (const entry of Deno.readDir(dailyDir)) {
    if (entry.name.endsWith(".tar.gz")) count += 1;
  }
  assert(count > 0, "expected daily archive");
});

Then("output is written to the log file", async function (this: ZenWorld) {
  assertEquals(await exists(join(this.cwd, "backups", "backup.log")), true);
});

Then("stdout lists {string}", function (this: ZenWorld, value: string) {
  assertStringIncludes(this.stdout, normalizeLegacyName(value).replace(".plist", ""));
});

Then(
  "a macOS notification is displayed with title {string}",
  async function (this: ZenWorld, title: string) {
    const content = await readNotifications(this);
    assertStringIncludes(content, title);
    assertStringIncludes(content, "darwin");
  },
);

Then("the notification contains {string}", async function (this: ZenWorld, value: string) {
  const content = await readNotifications(this);
  assertStringIncludes(content.toLowerCase(), value.toLowerCase());
});

Then(
  "the notification contains {string} and {string}",
  async function (this: ZenWorld, a: string, b: string) {
    const content = await readNotifications(this);
    assertStringIncludes(content.toLowerCase(), a.toLowerCase());
    assertStringIncludes(content.toLowerCase(), b.toLowerCase());
  },
);

Then("the backup completes successfully", function (this: ZenWorld) {
  assertEquals(this.exitCode, 0);
});

Then("the local backup archive exists", async function (this: ZenWorld) {
  const dailyDir = join(this.cwd, "backups", "daily");
  let found = false;
  for await (const entry of Deno.readDir(dailyDir)) {
    if (entry.name.endsWith(".tar.gz")) found = true;
  }
  assert(found, "expected local archive");
});

Then("no notification is displayed", async function (this: ZenWorld) {
  assertEquals(await exists(join(this.cwd, "backups", "notifications.log")), false);
});

Then("the warning is still logged to backup.log", async function (this: ZenWorld) {
  const content = await Deno.readTextFile(join(this.cwd, "backups", "backup.log"));
  assertStringIncludes(content.toLowerCase(), "warning");
});

async function runInstall(world: ZenWorld): Promise<void> {
  const result = await runCli(["install"], {
    cwd: world.cwd,
    os: "darwin",
    env: world.envWithHome(),
  });
  world.stdout = result.stdout;
  world.stderr = result.stderr;
  world.exitCode = result.exitCode;
}

async function runLiteralCommand(world: ZenWorld, command: string): Promise<void> {
  const parts = command.trim().split(/\s+/);
  if (parts[0] !== "zen-backup") {
    throw new Error(`unsupported command literal: ${command}`);
  }
  const result = await runCli(parts.slice(1), {
    cwd: world.cwd,
    os: "darwin",
    env: world.envWithHome(),
  });
  world.stdout = result.stdout;
  world.stderr = result.stderr;
  world.exitCode = result.exitCode;
}

async function ensurePlatformConfig(world: ZenWorld): Promise<void> {
  const profileDir = join(world.cwd, "profile");
  const backupDir = join(world.cwd, "backups");
  await Deno.mkdir(profileDir, { recursive: true });
  await Deno.mkdir(backupDir, { recursive: true });
  await Deno.mkdir(join(world.cwd, "custom"), { recursive: true });
  await Deno.writeTextFile(
    join(world.cwd, "custom", "settings.toml"),
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${backupDir}"\n`,
  );
  world.env.ZEN_BACKUP_CONFIG = "custom/settings.toml";
}

function expandKnownPath(world: ZenWorld, raw: string): string {
  return raw.replace("~", world.cwd).replace("%USERPROFILE%", world.cwd).replace(
    "%APPDATA%",
    join(world.cwd, "AppData", "Roaming"),
  );
}

async function readNotifications(world: ZenWorld): Promise<string> {
  return await Deno.readTextFile(join(world.cwd, "backups", "notifications.log"));
}

async function assertSettingsContains(world: ZenWorld, value: string): Promise<void> {
  const path = join(world.cwd, ".config", "zen-profile-backup", "settings.toml");
  const text = await Deno.readTextFile(path);
  assertStringIncludes(text, value);
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

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeLegacyName(value: string): string {
  return value.replace("com.zen-backup", "com.prometheas.zen-backup");
}
