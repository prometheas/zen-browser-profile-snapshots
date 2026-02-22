import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { openBrowserUrl } from "../../src/platform/browser.ts";

Deno.test("openBrowserUrl succeeds in simulated mode", async () => {
  const result = await openBrowserUrl("https://example.com", {
    env: { ZEN_BACKUP_TEST_BROWSER_OPEN: "1" },
    os: "darwin",
  });

  assertEquals(result.ok, true);
});

Deno.test("openBrowserUrl returns failure in simulated failure mode", async () => {
  const result = await openBrowserUrl("https://example.com", {
    env: { ZEN_BACKUP_TEST_BROWSER_OPEN: "0" },
    os: "linux",
  });

  assertEquals(result.ok, false);
  assertStringIncludes(result.error ?? "", "simulated browser open failure");
});
