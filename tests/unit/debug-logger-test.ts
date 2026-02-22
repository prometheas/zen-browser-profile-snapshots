import { assertEquals, assertMatch } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { createDebugLogger } from "../../src/debug/logger.ts";

Deno.test("debug logger writes to stderr when enabled", async () => {
  const lines: string[] = [];
  const logger = createDebugLogger({
    enabled: true,
    writeStderr: (line: string) => lines.push(line),
  });

  await logger.debug("debug message");

  assertEquals(lines.length, 1);
  assertMatch(lines[0], /^\[DEBUG\] \d{4}-\d{2}-\d{2}T.* debug message$/);
});

Deno.test("debug logger writes to file when log path configured", async () => {
  const dir = await Deno.makeTempDir();
  const path = join(dir, "trace.log");
  const logger = createDebugLogger({
    enabled: true,
    logFilePath: path,
    writeStderr: () => undefined,
  });

  await logger.debug("file output");

  const text = await Deno.readTextFile(path);
  assertMatch(text.trim(), /^\[DEBUG\] \d{4}-\d{2}-\d{2}T.* file output$/);
});
