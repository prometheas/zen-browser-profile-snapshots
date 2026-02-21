import { assertEquals } from "jsr:@std/assert@1.0.19";
import { parseVersionForDisplay } from "../../src/cli/version.ts";

Deno.test("parseVersionForDisplay parses production semver", () => {
  const parsed = parseVersionForDisplay("v1.2.3");
  assertEquals(parsed.kind, "production");
  assertEquals(parsed.semver, "1.2.3");
});

Deno.test("parseVersionForDisplay parses preview beta with hash", () => {
  const parsed = parseVersionForDisplay("0.3.0-beta.1-7-gec48680");
  assertEquals(parsed.kind, "preview");
  assertEquals(parsed.semver, "0.3.0");
  assertEquals(parsed.channel, "beta");
  assertEquals(parsed.channelIteration, "1");
  assertEquals(parsed.aheadCount, "7");
  assertEquals(parsed.hash, "ec48680");
});

Deno.test("parseVersionForDisplay parses preview alpha without hash", () => {
  const parsed = parseVersionForDisplay("0.3.0-alpha.2");
  assertEquals(parsed.kind, "preview");
  assertEquals(parsed.channel, "alpha");
  assertEquals(parsed.channelIteration, "2");
  assertEquals(parsed.hash, undefined);
});
