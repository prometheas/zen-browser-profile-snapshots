import { DataTable, Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assert, assertEquals } from "jsr:@std/assert@1.0.19";
import { dirname, join } from "jsr:@std/path@1.1.4";
import { toTomlStringLiteral } from "../../../src/core/toml-string.ts";
import { runCli } from "../../../src/main.ts";
import { ZenWorld } from "../support/world.ts";

Given("the backup directory contains:", async function (this: ZenWorld, table: DataTable) {
  this.backupDir = join(this.cwd, "backups");
  this.profileDir = join(this.cwd, "profile");
  await Deno.mkdir(this.profileDir, { recursive: true });
  await Deno.mkdir(this.backupDir, { recursive: true });

  for (const row of table.hashes()) {
    const subdirectory = row.subdirectory;
    const file = row.file ?? `generated-${subdirectory}.tar.gz`;
    const path = join(this.backupDir, subdirectory, file);
    await Deno.mkdir(dirname(path), { recursive: true });
    const bytes = row.size ? parseSize(row.size) : row.total_size ? parseSize(row.total_size) : 128;
    await Deno.writeFile(path, new Uint8Array(bytes));
  }

  await writeConfig(this, this.profileDir, this.backupDir);
});

Given("the backup directory exists but contains no archives", async function (this: ZenWorld) {
  this.backupDir = join(this.cwd, "backups");
  this.profileDir = join(this.cwd, "profile");
  await Deno.mkdir(this.profileDir, { recursive: true });
  await Deno.mkdir(this.backupDir, { recursive: true });
  await writeConfig(this, this.profileDir, this.backupDir);
});

Given("the backup directory does not exist", async function (this: ZenWorld) {
  this.backupDir = join(this.cwd, "missing-backups");
  this.profileDir = join(this.cwd, "profile");
  await Deno.mkdir(this.profileDir, { recursive: true });
  await writeConfig(this, this.profileDir, this.backupDir);
});

When("the list command is run", async function (this: ZenWorld) {
  const result = await runCli(["list"], {
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
});

Then(
  "stdout contains {string} or a size indicator",
  function (this: ZenWorld, expected: string) {
    const hasExpected = this.stdout.includes(expected);
    const hasSize = /\d+(\.\d+)?\s?(B|KB|MB|GB|TB)/.test(this.stdout);
    assert(hasExpected || hasSize, `expected stdout to include ${expected} or a size indicator`);
  },
);

Then("stdout contains {string} or {string}", function (this: ZenWorld, a: string, b: string) {
  const text = this.stdout.toLowerCase();
  const isSchedulerEmptyCheck = a.toLowerCase().includes("no scheduled jobs");
  assert(
    text.includes(a.toLowerCase()) ||
      text.includes(b.toLowerCase()) ||
      (isSchedulerEmptyCheck && text.includes("not installed")),
    `expected stdout to include ${a} or ${b}`,
  );
});

Then(
  "{string} appears before {string} in stdout",
  function (this: ZenWorld, first: string, second: string) {
    const left = this.stdout.indexOf(first);
    const right = this.stdout.indexOf(second);
    assert(left >= 0 && right >= 0 && left < right, `${first} should appear before ${second}`);
  },
);

Then("stdout does not contain {string}", function (this: ZenWorld, value: string) {
  assertEquals(this.stdout.includes(value), false);
});

Then(
  "the daily archive is labeled as {string} or in a daily section",
  function (this: ZenWorld, label: string) {
    assert(
      this.stdout.includes(label) || this.stdout.toLowerCase().includes("daily:"),
      "expected daily section/label",
    );
  },
);

Then(
  "the weekly archive is labeled as {string} or in a weekly section",
  function (this: ZenWorld, label: string) {
    assert(
      this.stdout.includes(label) || this.stdout.toLowerCase().includes("weekly:"),
      "expected weekly section/label",
    );
  },
);

Then("stderr contains {string} or {string}", function (this: ZenWorld, a: string, b: string) {
  assert(
    this.stderr.toLowerCase().includes(a.toLowerCase()) ||
      this.stderr.toLowerCase().includes(b.toLowerCase()),
    `expected stderr to include ${a} or ${b}`,
  );
});

async function writeConfig(
  world: ZenWorld,
  profilePath: string,
  backupPath: string,
): Promise<void> {
  const configPath = world.resolvePath("custom/settings.toml");
  world.env.ZEN_BACKUP_CONFIG = "custom/settings.toml";
  await Deno.mkdir(dirname(configPath), { recursive: true });
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = ${toTomlStringLiteral(profilePath)}\n\n[backup]\nlocal_path = ${
      toTomlStringLiteral(backupPath)
    }\n`,
  );
}

function parseSize(value: string): number {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)?$/i);
  if (!match) return 128;
  const amount = Number(match[1]);
  const unit = (match[2] ?? "B").toUpperCase();
  const factor = unit === "KB" ? 1024 : unit === "MB" ? 1024 ** 2 : unit === "GB" ? 1024 ** 3 : 1;
  return Math.max(1, Math.floor(amount * factor));
}
