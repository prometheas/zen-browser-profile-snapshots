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
});

Deno.test("subcommand --help renders command help and exits zero", async () => {
  const result = await runCli(["schedule", "--help"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "zen-backup schedule");
  assertStringIncludes(result.stdout, "resume = start");
});
