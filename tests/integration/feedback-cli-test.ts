import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("feedback bug uses gh issue create when gh available", async () => {
  const tempDir = await Deno.makeTempDir();
  const result = await runCli(["feedback", "bug"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_TEST_GH_AVAILABLE: "1",
      ZEN_BACKUP_TEST_FEEDBACK_ANSWERS: JSON.stringify({
        title: "Bug title",
        description: "Desc",
        steps_to_reproduce: "Step",
        expected_behavior: "Expected",
      }),
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Created issue:");
});

Deno.test("feedback request opens browser URL when gh unavailable", async () => {
  const tempDir = await Deno.makeTempDir();
  const result = await runCli(["feedback", "request"], {
    cwd: tempDir,
    os: "linux",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_TEST_GH_AVAILABLE: "0",
      ZEN_BACKUP_TEST_BROWSER_OPEN: "1",
      ZEN_BACKUP_TEST_FEEDBACK_ANSWERS: JSON.stringify({
        title: "Feature",
        problem: "Problem",
        solution: "Solution",
        platforms: "all",
      }),
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Opened feedback URL:");
  assertStringIncludes(result.stdout, "feature-request.yml");
});

Deno.test("--debug with --log-file writes debug log file", async () => {
  const tempDir = await Deno.makeTempDir();
  const logPath = join(tempDir, "debug.log");

  const result = await runCli(["--debug", "--log-file", logPath, "status"], {
    cwd: tempDir,
    os: "darwin",
    env: { HOME: tempDir, NO_COLOR: "1" },
  });

  assertEquals(result.exitCode, 0);
  const text = await Deno.readTextFile(logPath);
  assertStringIncludes(text, "[DEBUG]");
  assertStringIncludes(text, 'argv=["status"]');
});
