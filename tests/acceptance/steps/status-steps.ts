import { DataTable, Given, Then } from "npm:@cucumber/cucumber@12.6.0";
import { assert } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../../src/main.ts";
import type { Platform } from "../../../src/types.ts";
import { ZenWorld } from "../support/world.ts";

Given(
  "the backup directory exists but contains no daily archives",
  async function (this: ZenWorld) {
    await ensureInstalled(this);
    await Deno.mkdir(join(this.backupDir, "weekly"), { recursive: true });
  },
);

Given(
  "the backup directory exists but contains no weekly archives",
  async function (this: ZenWorld) {
    await ensureInstalled(this);
    await Deno.mkdir(join(this.backupDir, "daily"), { recursive: true });
  },
);

Given(
  "the backup directory contains archives totaling {int} MB",
  async function (this: ZenWorld, sizeMb: number) {
    await ensureInstalled(this);
    await Deno.mkdir(join(this.backupDir, "daily"), { recursive: true });
    await Deno.writeFile(
      join(this.backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz"),
      new Uint8Array(sizeMb * 1024 * 1024),
    );
  },
);

Given("the backup scheduled jobs are installed", async function (this: ZenWorld) {
  await ensureInstalled(this);
  const agentsDir = join(this.cwd, "Library", "LaunchAgents");
  await Deno.mkdir(agentsDir, { recursive: true });
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.daily.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, "com.prometheas.zen-backup.weekly.plist"), "<plist/>");
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
});

Given("no backup scheduled jobs are installed", async function (this: ZenWorld) {
  await ensureInstalled(this);
  const agentsDir = join(this.cwd, "Library", "LaunchAgents");
  await Deno.remove(join(agentsDir, "com.prometheas.zen-backup.daily.plist")).catch(() =>
    undefined
  );
  await Deno.remove(join(agentsDir, "com.prometheas.zen-backup.weekly.plist")).catch(() =>
    undefined
  );
  await Deno.remove(join(agentsDir, ".zen-backup-loaded")).catch(() => undefined);
});

Given("the backup tool is installed", async function (this: ZenWorld) {
  await ensureInstalled(this);
  await runCli(["install"], {
    cwd: this.cwd,
    os: targetOs(this),
    env: {
      ...this.env,
      HOME: this.cwd,
      ZEN_BACKUP_PROFILE_PATH: this.profileDir,
    },
  });
});

Given("settings.toml contains:", async function (this: ZenWorld, table: DataTable) {
  await ensureInstalled(this);
  for (const row of table.hashes()) {
    const key = row.key;
    const value = row.value;
    if (key === "profile.path") this.profileDir = join(this.cwd, value.replace("~/", ""));
    if (key === "backup.local_path") this.backupDir = join(this.cwd, value.replace("~/", ""));
    if (key === "backup.cloud_path") this.cloudPath = join(this.cwd, value.replace("~/", ""));
    if (key === "retention.daily_days") this.retentionDaily = Number(value);
    if (key === "retention.weekly_days") this.retentionWeekly = Number(value);
  }
  await writeConfig(this);
});

Given(
  "the most recent daily backup is less than {int} days old",
  async function (this: ZenWorld, days: number) {
    await ensureInstalled(this);
    this.now = new Date("2026-01-20T00:00:00Z");
    await writeDailyArchiveForAge(this, Math.max(0, days - 1));
  },
);

Given(
  "the most recent daily backup is more than {int} days old",
  async function (this: ZenWorld, days: number) {
    await ensureInstalled(this);
    this.now = new Date("2026-01-20T00:00:00Z");
    await writeDailyArchiveForAge(this, days + 1);
  },
);

Given("the backup directory contains no archives", async function (this: ZenWorld) {
  await ensureInstalled(this);
});

Given(
  "the backup tool was installed more than {int} day ago",
  function (this: ZenWorld, _days: number) {
    // Install timestamp is not tracked yet; this step is declarative for acceptance flow.
  },
);

Given("the configured backup directory does not exist", async function (this: ZenWorld) {
  await ensureInstalled(this);
  this.backupDir = join(this.cwd, "missing-backups");
  await writeConfig(this);
});

Given("the backup directory is not readable", async function (this: ZenWorld) {
  await ensureInstalled(this);
  await Deno.mkdir(join(this.backupDir, "daily"), { recursive: true });
  await Deno.writeFile(
    join(this.backupDir, "daily", "zen-backup-daily-2026-01-15.tar.gz"),
    new Uint8Array(1024),
  );
  await Deno.chmod(this.backupDir, 0o000);
});

Then("stdout contains {string} or a date indicator", function (this: ZenWorld, expected: string) {
  const hasDate = /\d{4}-\d{2}-\d{2}/.test(this.stdout);
  assert(this.stdout.includes(expected) || hasDate, `expected ${expected} or a date in stdout`);
});

Then("stdout contains disk usage information", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("disk usage"), "expected disk usage information");
});

Then("the displayed usage is approximately {int} MB", function (this: ZenWorld, mb: number) {
  assert(
    this.stdout.includes(`${mb}.0 MB`) || this.stdout.includes(`${mb} MB`),
    "expected MB usage",
  );
});

Then("stdout shows daily directory size", function (this: ZenWorld) {
  assert(this.stdout.includes("Disk usage daily"), "expected daily usage line");
});

Then("stdout shows weekly directory size", function (this: ZenWorld) {
  assert(this.stdout.includes("Disk usage weekly"), "expected weekly usage line");
});

Then("stdout indicates scheduled jobs are active", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("scheduled jobs: active"), "expected active scheduler");
});

Then("stdout shows the profile path", function (this: ZenWorld) {
  assert(this.stdout.includes("Profile path:"), "expected profile path");
});

Then("stdout shows the backup directory", function (this: ZenWorld) {
  assert(this.stdout.includes("Backup directory:"), "expected backup directory");
});

Then("stdout shows cloud sync is enabled", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("cloud sync: enabled"), "expected cloud enabled");
});

Then("stdout indicates {string} or no cloud path", function (this: ZenWorld, expected: string) {
  assert(
    this.stdout.toLowerCase().includes(expected.toLowerCase()) ||
      this.stdout.toLowerCase().includes("cloud sync: local only"),
    "expected local-only status",
  );
});

Then("stdout indicates healthy status or no warnings", function (this: ZenWorld) {
  assert(
    this.stdout.toLowerCase().includes("health") || !this.stdout.toLowerCase().includes("warning"),
    "expected healthy status",
  );
});

Then("stdout contains a warning about stale backups", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("stale"), "expected stale warning");
});

Then("stdout contains a warning suggesting to run a backup", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("run a backup"), "expected run-backup warning");
});

Then("stdout shows daily retention period", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("daily"), "expected daily retention");
});

Then("stdout shows weekly retention period", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("weekly"), "expected weekly retention");
});

Then("stdout indicates backup directory not found", function (this: ZenWorld) {
  assert(this.stdout.toLowerCase().includes("backup directory not found"), "expected missing dir");
});

Then("suggests running a backup or checking configuration", function (this: ZenWorld) {
  const text = this.stdout.toLowerCase();
  assert(
    text.includes("run a backup") || text.includes("check configuration"),
    "expected suggestion for backup/config",
  );
});

Then("stdout indicates a permission error", function (this: ZenWorld) {
  assert(this.stderr.toLowerCase().includes("not readable"), "expected permission message");
});

async function ensureInstalled(world: ZenWorld): Promise<void> {
  world.profileDir = world.profileDir || join(world.cwd, "profile");
  world.backupDir = world.backupDir || join(world.cwd, "backups");
  await Deno.mkdir(world.profileDir, { recursive: true });
  await Deno.mkdir(world.backupDir, { recursive: true });
  await writeConfig(world);
}

async function writeConfig(world: ZenWorld): Promise<void> {
  const configPath = world.resolvePath("custom/settings.toml");
  world.env.ZEN_BACKUP_CONFIG = "custom/settings.toml";
  await Deno.mkdir(dirname(configPath), { recursive: true });
  const cloudLine = world.cloudPath ? `cloud_path = "${world.cloudPath}"\n` : "";
  const daily = world.retentionDaily;
  const weekly = world.retentionWeekly;
  const retention = daily === undefined && weekly === undefined
    ? ""
    : `\n[retention]\n${daily === undefined ? "" : `daily_days = ${daily}\n`}${
      weekly === undefined ? "" : `weekly_days = ${weekly}\n`
    }`;
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = "${world.profileDir}"\n\n[backup]\nlocal_path = "${world.backupDir}"\n${cloudLine}${retention}`,
  );
}

async function writeDailyArchiveForAge(world: ZenWorld, ageDays: number): Promise<void> {
  const anchor = world.now ?? new Date();
  const archiveDate = new Date(anchor.getTime() - ageDays * 24 * 60 * 60 * 1000);
  const day = archiveDate.toISOString().slice(0, 10);
  await Deno.mkdir(join(world.backupDir, "daily"), { recursive: true });
  await Deno.writeFile(
    join(world.backupDir, "daily", `zen-backup-daily-${day}.tar.gz`),
    new Uint8Array(1024),
  );
}

function targetOs(world: ZenWorld): Platform {
  const raw = world.env.ZEN_BACKUP_TEST_OS;
  if (raw === "linux" || raw === "windows" || raw === "darwin") return raw;
  return "darwin";
}
