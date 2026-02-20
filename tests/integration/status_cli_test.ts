import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { runCli } from "../../src/main.ts";

Deno.test("status shows not installed when config is missing", async () => {
  const tempDir = await Deno.makeTempDir();

  const result = await runCli(["status"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Not installed");
  assertStringIncludes(result.stdout, "zen-backup install");
});

Deno.test("backup command loads overridden config path", async () => {
  const tempDir = await Deno.makeTempDir();
  const configDir = `${tempDir}/custom`;
  const profileDir = `${tempDir}/profile`;

  await Deno.mkdir(configDir, { recursive: true });
  await Deno.mkdir(profileDir, { recursive: true });

  const configPath = `${configDir}/settings.toml`;
  await Deno.writeTextFile(
    configPath,
    `[profile]\npath = "${profileDir}"\n\n[backup]\nlocal_path = "${tempDir}/backups"\n`,
  );

  const result = await runCli(["backup", "daily"], {
    cwd: tempDir,
    os: "darwin",
    env: {
      HOME: tempDir,
      ZEN_BACKUP_CONFIG: "custom/settings.toml",
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout, "Created daily backup");
});
