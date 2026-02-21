import { assertEquals } from "jsr:@std/assert@1.0.19";
import { platformEnvFromTags } from "../acceptance/support/platform-env.ts";

Deno.test("platformEnvFromTags returns windows simulation flags for @windows", () => {
  assertEquals(platformEnvFromTags(["@windows"]), {
    ZEN_BACKUP_TEST_OS: "windows",
    ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_SCHEDULER: "1",
    ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_TOAST: "1",
  });
});

Deno.test("platformEnvFromTags sets linux and macos os identifiers", () => {
  assertEquals(platformEnvFromTags(["@linux"]), {
    ZEN_BACKUP_TEST_OS: "linux",
  });
  assertEquals(platformEnvFromTags(["@macos"]), {
    ZEN_BACKUP_TEST_OS: "darwin",
  });
});

Deno.test("platformEnvFromTags returns empty object when no platform tag exists", () => {
  assertEquals(platformEnvFromTags(["@core"]), {});
});
