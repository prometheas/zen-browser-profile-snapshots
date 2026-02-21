const mode = Deno.args[0] ?? "all";

const baseArgs = [
  "run",
  "-A",
  "npm:@cucumber/cucumber@12.6.0",
  "--import",
  "tests/acceptance/support/world.ts",
  "--import",
  "tests/acceptance/steps/index.ts",
];

const commandArgs = resolveArgs(mode);
if (!commandArgs) {
  console.error(
    "Usage: deno run -A scripts/task--test-acceptance.ts <all|platform|platform-macos|platform-linux|platform-windows|m1>",
  );
  Deno.exit(1);
}

const out = await new Deno.Command("deno", {
  args: [...baseArgs, ...commandArgs],
  stdout: "inherit",
  stderr: "inherit",
}).output();

Deno.exit(out.code);

function resolveArgs(selectedMode: string): string[] | null {
  if (selectedMode === "all") {
    return ["docs/features/**/*.feature"];
  }

  if (selectedMode === "platform") {
    return ["docs/features/platform/*.feature"];
  }

  if (
    selectedMode === "platform-macos" || selectedMode === "platform-linux" ||
    selectedMode === "platform-windows"
  ) {
    const osTag = selectedMode.replace("platform-", "");
    return [
      "--tags",
      `@${osTag}`,
      "docs/features/platform/install.feature",
      "docs/features/platform/scheduling.feature",
      "docs/features/platform/notifications.feature",
    ];
  }

  if (selectedMode === "m1") {
    return [
      "--name",
      'Status shows "Not installed" when settings.toml is missing|Config path can be overridden via environment variable|Create a daily backup manually|Create a weekly backup manually|Error when profile directory does not exist|SQLite databases are backed up safely|WAL and SHM files are not included in archive|Fallback when database is exclusively locked|All critical profile data is included|Security-sensitive files are excluded|Cache and transient data is excluded|Extension data in moz-extension directories is included|Backup is copied to cloud path when configured|No cloud copy when cloud sync is disabled|Successful backup is logged|Local backup succeeds when cloud sync fails',
      "docs/features/status.feature",
      "docs/features/core/configuration.feature",
      "docs/features/core/backup.feature",
    ];
  }

  return null;
}
