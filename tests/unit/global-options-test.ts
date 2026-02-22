import { assertEquals } from "jsr:@std/assert@1.0.19";
import { parseGlobalOptions } from "../../src/cli/global-options.ts";

Deno.test("parses --debug and strips it from command args", () => {
  const parsed = parseGlobalOptions(["--debug", "backup", "daily"]);
  assertEquals(parsed.debugEnabled, true);
  assertEquals(parsed.logFilePath, undefined);
  assertEquals(parsed.commandArgs, ["backup", "daily"]);
});

Deno.test("parses --log-file with explicit path", () => {
  const parsed = parseGlobalOptions(["status", "--log-file", "custom-debug.log"]);
  assertEquals(parsed.debugEnabled, false);
  assertEquals(parsed.logFilePath, "custom-debug.log");
  assertEquals(parsed.commandArgs, ["status"]);
});

Deno.test("uses default log filename when --log-file has no value", () => {
  const parsed = parseGlobalOptions(["--log-file", "status"]);
  assertEquals(parsed.debugEnabled, false);
  assertEquals(parsed.logFilePath, "zen-backup-debug.log");
  assertEquals(parsed.commandArgs, ["status"]);
});

Deno.test("supports both global flags together", () => {
  const parsed = parseGlobalOptions(["--debug", "--log-file", "trace.log", "list"]);
  assertEquals(parsed.debugEnabled, true);
  assertEquals(parsed.logFilePath, "trace.log");
  assertEquals(parsed.commandArgs, ["list"]);
});
