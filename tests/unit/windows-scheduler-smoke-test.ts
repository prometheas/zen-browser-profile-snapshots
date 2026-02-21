import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  parseSchedulerStates,
  validateSchedulerStates,
} from "../../scripts/task--test--smoke--windows--scheduler.ts";

Deno.test("parseSchedulerStates captures only target task labels", () => {
  const states = parseSchedulerStates(
    [
      "ZenBackupSmokeAbc123Daily: active",
      "ZenBackupSmokeAbc123Weekly: paused",
      "com.prometheas.zen-backup.daily: active",
    ].join("\n"),
    {
      daily: "ZenBackupSmokeAbc123Daily",
      weekly: "ZenBackupSmokeAbc123Weekly",
    },
  );

  assertEquals(states.get("ZenBackupSmokeAbc123Daily"), "active");
  assertEquals(states.get("ZenBackupSmokeAbc123Weekly"), "paused");
  assertEquals(states.size, 2);
});

Deno.test("validateSchedulerStates reports missing tasks with raw status output", () => {
  assertThrows(
    () =>
      validateSchedulerStates(
        new Map([["ZenBackupSmokeAbc123Daily", "active"]]),
        {
          daily: "ZenBackupSmokeAbc123Daily",
          weekly: "ZenBackupSmokeAbc123Weekly",
        },
        "active",
        "install",
        "ZenBackupSmokeAbc123Daily: active",
      ),
    Error,
    "missing tasks",
  );
});
