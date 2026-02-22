import { DataTable, Given, When } from "npm:@cucumber/cucumber@12.6.0";
import { runCli } from "../../../src/main.ts";
import type { Platform } from "../../../src/types.ts";
import { ZenWorld } from "../support/world.ts";

Given("GitHub CLI is available", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_TEST_GH_AVAILABLE = "1";
});

Given("GitHub CLI is unavailable", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_TEST_GH_AVAILABLE = "0";
  this.env.ZEN_BACKUP_TEST_BROWSER_OPEN = "1";
});

Given("feedback answers are provided:", function (this: ZenWorld, table: DataTable) {
  this.env.ZEN_BACKUP_TEST_FEEDBACK_ANSWERS = JSON.stringify(table.rowsHash());
});

When("the feedback bug command is run", async function (this: ZenWorld) {
  const result = await runCli(["feedback", "bug"], {
    cwd: this.cwd,
    os: targetOs(this),
    env: this.envWithHome(),
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

When("the feedback request command is run", async function (this: ZenWorld) {
  const result = await runCli(["feedback", "request"], {
    cwd: this.cwd,
    os: targetOs(this),
    env: this.envWithHome(),
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

function targetOs(world: ZenWorld): Platform {
  const raw = world.env.ZEN_BACKUP_TEST_OS;
  if (raw === "linux" || raw === "windows" || raw === "darwin") return raw;
  return "darwin";
}
