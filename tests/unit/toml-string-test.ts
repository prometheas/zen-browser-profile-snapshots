import { assertEquals } from "jsr:@std/assert@1.0.19";
import { toTomlStringLiteral } from "../../src/core/toml-string.ts";

Deno.test("toTomlStringLiteral escapes backslashes and quotes", () => {
  assertEquals(
    toTomlStringLiteral(String.raw`D:\Users\runneradmin\Zen "Profile"`),
    String.raw`"D:\\Users\\runneradmin\\Zen \"Profile\""`,
  );
});
