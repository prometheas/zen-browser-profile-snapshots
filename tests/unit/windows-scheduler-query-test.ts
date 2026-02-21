import { assertEquals } from "jsr:@std/assert@1.0.19";
import { parseWindowsTaskEnabledFromXml } from "../../src/platform/scheduler.ts";

Deno.test("parseWindowsTaskEnabledFromXml reads enabled=true", () => {
  const xml = `<?xml version="1.0"?><Task><Settings><Enabled>true</Enabled></Settings></Task>`;
  assertEquals(parseWindowsTaskEnabledFromXml(xml), true);
});

Deno.test("parseWindowsTaskEnabledFromXml reads enabled=false", () => {
  const xml = `<?xml version="1.0"?><Task><Settings><Enabled>false</Enabled></Settings></Task>`;
  assertEquals(parseWindowsTaskEnabledFromXml(xml), false);
});

Deno.test("parseWindowsTaskEnabledFromXml defaults to true when missing", () => {
  const xml = `<?xml version="1.0"?><Task><Settings></Settings></Task>`;
  assertEquals(parseWindowsTaskEnabledFromXml(xml), true);
});
