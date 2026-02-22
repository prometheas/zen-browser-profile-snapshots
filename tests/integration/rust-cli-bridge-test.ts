import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("runCli uses rust bridge when ZEN_BACKUP_USE_RUST_CLI is enabled", async () => {
  const tempDir = await Deno.makeTempDir();
  const fakeCli = join(tempDir, "fake-rust-cli.sh");
  await Deno.writeTextFile(
    fakeCli,
    `#!/usr/bin/env sh
echo "bridge-stdout:$*"
echo "bridge-stderr:$*" >&2
exit 7
`,
  );
  await Deno.chmod(fakeCli, 0o755);

  const result = await runCli(["status"], {
    env: {
      ZEN_BACKUP_USE_RUST_CLI: "1",
      ZEN_BACKUP_RUST_CLI_BIN: fakeCli,
    },
  });

  assertEquals(result.exitCode, 7);
  assertStringIncludes(result.stdout, "bridge-stdout:status");
  assertStringIncludes(result.stderr, "bridge-stderr:status");
});
