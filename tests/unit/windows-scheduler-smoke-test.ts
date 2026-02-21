import { assertEquals, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  parseSchedulerStates,
  parseSchtasksEnabledFromListOutput,
  validateSchedulerStates,
  waitForExpectedStates,
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

Deno.test("waitForExpectedStates retries until tasks become active", async () => {
  let attempts = 0;
  await waitForExpectedStates(
    () => {
      attempts += 1;
      if (attempts < 3) {
        return Promise.resolve({
          states: new Map([["ZenBackupSmokeAbc123Daily", "active"]]),
          raw: "ZenBackupSmokeAbc123Daily: active",
        });
      }
      return Promise.resolve({
        states: new Map([
          ["ZenBackupSmokeAbc123Daily", "active"],
          ["ZenBackupSmokeAbc123Weekly", "active"],
        ]),
        raw: [
          "ZenBackupSmokeAbc123Daily: active",
          "ZenBackupSmokeAbc123Weekly: active",
        ].join("\n"),
      });
    },
    {
      daily: "ZenBackupSmokeAbc123Daily",
      weekly: "ZenBackupSmokeAbc123Weekly",
    },
    "active",
    "install",
    4,
    0,
  );

  assertEquals(attempts, 3);
});

Deno.test("parseSchtasksEnabledFromListOutput detects disabled task state", () => {
  const output = [
    "Folder: \\",
    "TaskName: ZenBackupSmokeDaily",
    "Scheduled Task State: Disabled",
  ].join("\n");
  assertEquals(parseSchtasksEnabledFromListOutput(output), false);
});

Deno.test("parseSchtasksEnabledFromListOutput detects enabled task state", () => {
  const output = [
    "Folder: \\",
    "TaskName: ZenBackupSmokeDaily",
    "Scheduled Task State: Enabled",
  ].join("\n");
  assertEquals(parseSchtasksEnabledFromListOutput(output), true);
});
