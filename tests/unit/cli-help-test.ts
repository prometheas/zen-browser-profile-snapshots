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
  assertStringIncludes(result.stdout, "feedback <bug|request>");
  assertStringIncludes(result.stdout, "--debug");
  assertStringIncludes(result.stdout, "--log-file");
});

Deno.test("subcommand --help renders command help and exits zero", async () => {
  const result = await runCli(["schedule", "--help"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "zen-backup schedule");
  assertStringIncludes(result.stdout, "resume = start");
});

Deno.test("global -v renders version and exits zero", async () => {
  const result = await runCli(["-v"], { env: { NO_COLOR: "1" }, version: "v9.9.9" });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertEquals(result.stdout, "9.9.9");
});

Deno.test("global --version renders version and exits zero", async () => {
  const result = await runCli(["--version"], { env: { NO_COLOR: "1" }, version: "v9.9.8" });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertEquals(result.stdout, "9.9.8");
});

Deno.test("global --version keeps production output uncolored", async () => {
  const result = await runCli(["--version"], { env: { CLICOLOR_FORCE: "1" }, version: "v1.2.3" });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertEquals(result.stdout, "1.2.3");
});

Deno.test("global --version styles preview channel and hash", async () => {
  const result = await runCli(["--version"], {
    env: { CLICOLOR_FORCE: "1" },
    version: "v1.2.3-beta.1-5-gabc1234",
  });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "1.2.3-");
  assertStringIncludes(result.stdout, "\u001b[1;33mbeta\u001b[0m.1");
  assertStringIncludes(result.stdout, "-5-\u001b[90mgabc1234\u001b[0m");
});

Deno.test("global --version uses red channel for alpha", async () => {
  const result = await runCli(["--version"], {
    env: { CLICOLOR_FORCE: "1" },
    version: "v1.2.3-alpha.2-1-gdef5678",
  });
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "\u001b[1;31malpha\u001b[0m.2");
});

Deno.test("global --version preview stays plain when color disabled", async () => {
  const result = await runCli(["--version"], {
    env: { NO_COLOR: "1" },
    version: "v1.2.3-beta.1-7-gec48680",
  });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stdout, "1.2.3-beta.1-7-gec48680");
});

Deno.test("feedback --help renders command help and exits zero", async () => {
  const result = await runCli(["feedback", "--help"], { env: { NO_COLOR: "1" } });
  assertEquals(result.exitCode, 0);
  assertEquals(result.stderr, "");
  assertStringIncludes(result.stdout, "zen-backup feedback");
  assertStringIncludes(result.stdout, "feedback <bug|request>");
});

Deno.test("global debug flags are accepted before command", async () => {
  const result = await runCli(["--debug", "--log-file", "debug.log", "status"], {
    env: { NO_COLOR: "1" },
  });
  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Not installed");
});
