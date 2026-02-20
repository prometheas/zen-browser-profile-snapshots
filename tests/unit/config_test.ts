import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { expandPath } from "../../src/core/path_utils.ts";
import { loadConfig, resolveConfigPath } from "../../src/config.ts";

Deno.test("resolveConfigPath uses env override", () => {
  const path = resolveConfigPath({
    cwd: "/tmp/work",
    os: "darwin",
    env: {
      HOME: "/Users/test",
      ZEN_BACKUP_CONFIG: "custom/config.toml",
    },
  });

  assertEquals(path, "/tmp/work/custom/config.toml");
});

Deno.test("expandPath handles tilde and env variables", () => {
  const env = {
    HOME: "/Users/test",
    ZEN_BACKUP_DIR: "custom/path",
  };

  assertEquals(expandPath("~/zen-backups", env), "/Users/test/zen-backups");
  assertEquals(expandPath("$ZEN_BACKUP_DIR/backups", env), "custom/path/backups");
});

Deno.test("loadConfig applies defaults and expansion", async () => {
  const config = await loadConfig({
    required: true,
    cwd: "/tmp/project",
    os: "darwin",
    env: {
      HOME: "/Users/test",
      ZEN_BACKUP_CONFIG: "settings.toml",
    },
    readTextFile: () => Promise.resolve(`
[profile]
path = "~/my-zen-profile"

[backup]
local_path = "$HOME/backups"
`),
  });

  if (!config) {
    throw new Error("expected config");
  }

  assertEquals(config.profile.path, "/Users/test/my-zen-profile");
  assertEquals(config.backup.local_path, "/Users/test/backups");
  assertEquals(config.retention.daily_days, 30);
  assertEquals(config.retention.weekly_days, 84);
  assertEquals(config.schedule.daily_time, "12:30");
  assertEquals(config.notifications.enabled, true);
  assertStringIncludes(config._meta.config_path, "settings.toml");
});
