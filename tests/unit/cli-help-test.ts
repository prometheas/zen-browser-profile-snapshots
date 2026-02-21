import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { runCli } from "../../src/main.ts";

Deno.test("global -h renders help and exits zero", async () => {
  const result = await runCli(["-h"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "Zen Profile Backup");
  assertStringIncludes(result.stdout, "zen-backup <command> [options]");
});

Deno.test("global --help renders help and exits zero", async () => {
  const result = await runCli(["--help"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "Global Options");
  assertStringIncludes(result.stdout, "-v, --version");
});

Deno.test("subcommand --help renders command help and exits zero", async () => {
  const result = await runCli(["schedule", "--help"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "zen-backup schedule");
  assertStringIncludes(result.stdout, "resume = start");
});

Deno.test("global -v renders version and exits zero", async () => {
  const result = await runCli(["-v"], {
    env: { ZEN_BACKUP_VERSION: "v9.9.9-test", NO_COLOR: "1" },
  });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertEquals(result.stdout, "zen-backup 9.9.9 test");
});

Deno.test("global --version renders version and exits zero", async () => {
  const result = await runCli(["--version"], {
    env: { ZEN_BACKUP_VERSION: "v9.9.8-test", NO_COLOR: "1" },
  });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertEquals(result.stdout, "zen-backup 9.9.8 test");
});

Deno.test("global --version styles suffix and hash", async () => {
  const result = await runCli(["--version"], {
    env: { ZEN_BACKUP_VERSION: "v1.2.3-beta.1-5-gabc1234", CLICOLOR_FORCE: "1" },
  });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "zen-backup 1.2.3");
  assertStringIncludes(result.stdout, "\u001b[1mbeta.1\u001b[0m");
  assertStringIncludes(result.stdout, "\u001b[90m#abc1234\u001b[0m");
});
