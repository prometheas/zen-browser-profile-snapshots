import { assertEquals } from "jsr:@std/assert@1.0.19";
import { buildScenarioEnv } from "../acceptance/support/world-env.ts";

Deno.test("buildScenarioEnv keeps ZEN_BACKUP_* values and resets unrelated vars", () => {
  const env = buildScenarioEnv(
    {
      ZEN_BACKUP_TEST_OS: "windows",
      ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_SCHEDULER: "1",
      ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_TOAST: "1",
      UNRELATED: "drop-me",
    },
    "tmp-home",
  );

  assertEquals(env.HOME, "tmp-home");
  assertEquals(env.ZEN_BACKUP_TEST_OS, "windows");
  assertEquals(env.ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_SCHEDULER, "1");
  assertEquals(env.ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_TOAST, "1");
  assertEquals(env.UNRELATED, undefined);
});
