import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import { runCli } from "../../src/main.ts";

Deno.test("runCli always uses rust bridge even when legacy TS fallback env is set", async () => {
  const tempDir = await Deno.makeTempDir();
  const fakeCli = join(tempDir, "fake-rust-cli.sh");
  await Deno.writeTextFile(
    fakeCli,
    `#!/usr/bin/env sh
echo "bridge-default:$*"
exit 7
`,
  );
  await Deno.chmod(fakeCli, 0o755);

  const rustDefault = await runCli(["status"], {
    env: {
      ZEN_BACKUP_RUST_CLI_BIN: fakeCli,
    },
  });
  assertEquals(rustDefault.exitCode, 7);
  assertStringIncludes(rustDefault.stdout, "bridge-default:status");

  const stillRust = await runCli(["status"], {
    env: {
      ZEN_BACKUP_RUST_CLI_BIN: fakeCli,
      ZEN_BACKUP_USE_TS_CLI: "1",
    },
  });
  assertEquals(stillRust.exitCode, 7);
  assertStringIncludes(stillRust.stdout, "bridge-default:status");
});

Deno.test("runCli rust bridge maps RuntimeOptions into test env and cwd", async () => {
  const tempDir = await Deno.makeTempDir();
  const runDir = join(tempDir, "run-dir");
  await Deno.mkdir(runDir, { recursive: true });
  const fakeCli = join(tempDir, "fake-rust-cli.sh");
  await Deno.writeTextFile(
    fakeCli,
    `#!/usr/bin/env sh
echo "cwd:$PWD"
echo "os:$ZEN_BACKUP_TEST_OS"
echo "now:$ZEN_BACKUP_TEST_NOW"
echo "version:$ZEN_BACKUP_TEST_VERSION"
echo "custom:$CUSTOM_FLAG"
`,
  );
  await Deno.chmod(fakeCli, 0o755);

  const result = await runCli(["status"], {
    cwd: runDir,
    os: "linux",
    now: new Date("2026-02-22T06:30:00.000Z"),
    version: "v0.3.0-beta.5",
    env: {
      ZEN_BACKUP_USE_RUST_CLI: "1",
      ZEN_BACKUP_RUST_CLI_BIN: fakeCli,
      CUSTOM_FLAG: "present",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "cwd:");
  assertStringIncludes(result.stdout, "/run-dir");
  assertStringIncludes(result.stdout, "os:linux");
  assertStringIncludes(result.stdout, "now:2026-02-22T06:30:00.000Z");
  assertStringIncludes(result.stdout, "version:v0.3.0-beta.5");
  assertStringIncludes(result.stdout, "custom:present");
});
