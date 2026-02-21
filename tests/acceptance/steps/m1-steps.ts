import { Before, Given, Then, When } from "npm:@cucumber/cucumber@12.6.0";
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { dirname } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../../../src/config.ts";
import { expandPath } from "../../../src/core/path-utils.ts";
import { runCli } from "../../../src/main.ts";
import { ZenWorld } from "../support/world.ts";

Before(async function (this: ZenWorld) {
  await this.initWorkspace();
});

Given("no settings.toml file exists", function (this: ZenWorld) {
  this.env.ZEN_BACKUP_CONFIG = undefined;
});

When("the status command is run", async function (this: ZenWorld) {
  const result = await runCli(["status"], {
    cwd: this.cwd,
    os: "darwin",
    now: this.now,
    env: this.env,
  });
  this.stdout = result.stdout;
  this.stderr = result.stderr;
  this.exitCode = result.exitCode;
});

Then("stdout contains {string}", function (this: ZenWorld, expected: string) {
  assertStringIncludes(this.stdout, expected);
});

Then("stdout suggests running {string}", function (this: ZenWorld, expected: string) {
  assertStringIncludes(this.stdout, expected);
});

Then("the exit code is {int}", function (this: ZenWorld, expected: number) {
  assertEquals(this.exitCode, expected);
});

Then("the exit code is non-zero", function (this: ZenWorld) {
  assertEquals(this.exitCode === 0, false);
});

Given(
  "the environment variable {string} is set to {string}",
  function (this: ZenWorld, key: string, value: string) {
    this.env[key] = value;
  },
);

Given(
  "a config file exists at {string} containing:",
  async function (this: ZenWorld, path: string, docString: string) {
    const fullPath = this.resolvePath(path);
    await Deno.mkdir(dirname(fullPath), { recursive: true });
    await Deno.writeTextFile(fullPath, docString);
  },
);

When("the configuration is loaded", async function (this: ZenWorld) {
  this.loadedConfig = await loadConfig({
    cwd: this.cwd,
    os: "darwin",
    env: this.env,
  });
});

Then(
  "profile.path equals the expanded value of {string}",
  function (this: ZenWorld, rawPath: string) {
    const config = this.loadedConfig as { profile: { path: string } };
    const expected = expandPath(rawPath, this.env, this.cwd);
    assertEquals(config.profile.path, expected);
  },
);
