import { DataTable, Given, Then } from "npm:@cucumber/cucumber@12.6.0";
import { assertEquals } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { toTomlStringLiteral } from "../../../src/core/toml-string.ts";
import { ZenWorld } from "../support/world.ts";

Given("the configuration has {string}", async function (this: ZenWorld, setting: string) {
  await ensureWorkspace(this);
  const [key, rawValue] = setting.split("=").map((part) => part.trim());
  const value = Number(rawValue);

  if (key === "retention.daily_days") this.retentionDaily = value;
  if (key === "retention.weekly_days") this.retentionWeekly = value;
  await writeConfig(this);
});

Given("the configuration has:", async function (this: ZenWorld, table: DataTable) {
  await ensureWorkspace(this);
  for (const row of table.hashes()) {
    const key = row.key.trim();
    const value = Number(row.value);
    if (key === "retention.daily_days") this.retentionDaily = value;
    if (key === "retention.weekly_days") this.retentionWeekly = value;
  }
  await writeConfig(this);
});

Given("the configuration does not specify retention periods", async function (this: ZenWorld) {
  await ensureWorkspace(this);
  this.retentionDaily = undefined;
  this.retentionWeekly = undefined;
  await writeConfig(this);
});

Given("the configuration has only {string}", async function (this: ZenWorld, setting: string) {
  await ensureWorkspace(this);
  const [key, rawValue] = setting.split("=").map((part) => part.trim());
  if (key === "retention.daily_days") {
    this.retentionDaily = Number(rawValue);
    this.retentionWeekly = undefined;
  }
  await writeConfig(this);
});

Given("{string} is not configured", async function (this: ZenWorld, key: string) {
  await ensureWorkspace(this);
  if (key === "retention.weekly_days") this.retentionWeekly = undefined;
  await writeConfig(this);
});

Given("cloud sync is configured", async function (this: ZenWorld) {
  await ensureWorkspace(this);
  this.cloudPath = join(this.cwd, "cloud-backups");
  await Deno.mkdir(this.cloudPath, { recursive: true });
  await writeConfig(this);
});

Given(
  "the backup directory contains daily archives:",
  async function (this: ZenWorld, table: DataTable) {
    await ensureWorkspace(this);
    await writeArchiveSet(this, "daily", table);
    deriveClockFromAges(this, table);
  },
);

Given(
  "the backup directory contains weekly archives:",
  async function (this: ZenWorld, table: DataTable) {
    await ensureWorkspace(this);
    await writeArchiveSet(this, "weekly", table);
    deriveClockFromAges(this, table);
  },
);

Given("the cloud daily directory contains:", async function (this: ZenWorld, table: DataTable) {
  await ensureWorkspace(this);
  const cloudRoot = this.cloudPath ?? join(this.cwd, "cloud-backups");
  await Deno.mkdir(cloudRoot, { recursive: true });
  await writeArchiveSetToRoot(cloudRoot, "daily", table);
  deriveClockFromAges(this, table);
});

Given("the cloud weekly directory contains:", async function (this: ZenWorld, table: DataTable) {
  await ensureWorkspace(this);
  const cloudRoot = this.cloudPath ?? join(this.cwd, "cloud-backups");
  await Deno.mkdir(cloudRoot, { recursive: true });
  await writeArchiveSetToRoot(cloudRoot, "weekly", table);
  deriveClockFromAges(this, table);
});

Given("the daily backup directory is empty", async function (this: ZenWorld) {
  await ensureWorkspace(this);
  await Deno.mkdir(join(this.backupDir, "daily"), { recursive: true });
});

Then("{string} exists in the daily directory", async function (this: ZenWorld, file: string) {
  assertEquals(await exists(join(this.backupDir, "daily", file)), true);
});

Then("{string} exists in the weekly directory", async function (this: ZenWorld, file: string) {
  assertEquals(await exists(join(this.backupDir, "weekly", file)), true);
});

Then("{string} does not exist", async function (this: ZenWorld, file: string) {
  const daily = await exists(join(this.backupDir, "daily", file));
  const weekly = await exists(join(this.backupDir, "weekly", file));
  assertEquals(daily || weekly, false);
});

Then(
  "{string} does not exist in the cloud daily directory",
  async function (this: ZenWorld, file: string) {
    const cloudRoot = this.cloudPath ?? join(this.cwd, "cloud-backups");
    assertEquals(await exists(join(cloudRoot, "daily", file)), false);
  },
);

Then(
  "{string} does not exist in the cloud weekly directory",
  async function (this: ZenWorld, file: string) {
    const cloudRoot = this.cloudPath ?? join(this.cwd, "cloud-backups");
    assertEquals(await exists(join(cloudRoot, "weekly", file)), false);
  },
);

Then("no warning about missing config is logged", async function (this: ZenWorld) {
  const logPath = join(this.backupDir, "backup.log");
  if (!(await exists(logPath))) return;
  const content = await Deno.readTextFile(logPath);
  assertEquals(content.toLowerCase().includes("missing config"), false);
});

Then("no errors are logged", async function (this: ZenWorld) {
  const logPath = join(this.backupDir, "backup.log");
  if (!(await exists(logPath))) return;
  const content = await Deno.readTextFile(logPath);
  assertEquals(content.includes("ERROR"), false);
});

async function ensureWorkspace(world: ZenWorld): Promise<void> {
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
  const daily = world.retentionDaily;
  const weekly = world.retentionWeekly;
  const retention = daily === undefined && weekly === undefined
    ? ""
    : `\n[retention]\n${daily === undefined ? "" : `daily_days = ${daily}\n`}${
      weekly === undefined ? "" : `weekly_days = ${weekly}\n`
    }`;
  const cloudLine = world.cloudPath ? `cloud_path = ${toTomlStringLiteral(world.cloudPath)}\n` : "";
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = ${toTomlStringLiteral(world.profileDir)}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(world.backupDir)
    }\n${cloudLine}${retention}`,
  );
}

async function writeArchiveSet(
  world: ZenWorld,
  kind: "daily" | "weekly",
  table: DataTable,
): Promise<void> {
  await writeArchiveSetToRoot(world.backupDir, kind, table);
}

async function writeArchiveSetToRoot(
  root: string,
  kind: "daily" | "weekly",
  table: DataTable,
): Promise<void> {
  const dir = join(root, kind);
  await Deno.mkdir(dir, { recursive: true });
  for (const row of table.hashes()) {
    const path = join(dir, row.file);
    await Deno.writeFile(path, new Uint8Array(64));
  }
}

function deriveClockFromAges(world: ZenWorld, table: DataTable): void {
  const rows = table.hashes();
  const withAges = rows.filter((row) =>
    row.age_days !== undefined && row.age_days.trim().length > 0
  );
  if (withAges.length === 0) return;

  const first = withAges[0];
  const fileDate = parseDateFromArchiveName(first.file);
  if (!fileDate) return;
  const ageDays = Number(first.age_days);
  if (Number.isNaN(ageDays)) return;

  world.now = new Date(fileDate.getTime() + ageDays * 24 * 60 * 60 * 1000);
}

function parseDateFromArchiveName(file: string): Date | null {
  const match = file.match(/-(\d{4}-\d{2}-\d{2})(?:-\d+)?\.tar\.gz$/);
  if (!match) return null;
  return new Date(`${match[1]}T00:00:00Z`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
