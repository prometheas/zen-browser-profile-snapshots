const SMOKE_FLAG = "ZEN_BACKUP_LIVE_SMOKE";

if (import.meta.main) {
  if (Deno.build.os !== "windows") {
    console.error("Windows scheduler smoke test can only run on windows.");
    Deno.exit(1);
  }
  if (Deno.env.get(SMOKE_FLAG) !== "1") {
    console.error(
      `Refusing to run live Task Scheduler smoke test without ${SMOKE_FLAG}=1.`,
    );
    Deno.exit(1);
  }

  const tempDir = await Deno.makeTempDir();
  const profileDir = `${tempDir}\\profile`;
  await Deno.mkdir(profileDir, { recursive: true });
  const configPath = `${tempDir}\\smoke-settings.toml`;

  const suffix = Date.now().toString(36).slice(-6);
  const taskPrefix = `ZenBackupSmoke${suffix}`;
  const taskNames = {
    daily: `${taskPrefix}Daily`,
    weekly: `${taskPrefix}Weekly`,
  };

  const env = {
    ...Deno.env.toObject(),
    ZEN_BACKUP_WINDOWS_TASK_PREFIX: taskPrefix,
    ZEN_BACKUP_CONFIG: configPath,
    ZEN_BACKUP_PROFILE_PATH: profileDir,
  };

  try {
    await run(["install"], env);
    await assertStates(env, taskNames, "active", "install");

    await run(["schedule", "stop"], env);
    await assertStates(env, taskNames, "paused", "stop");

    await run(["schedule", "start"], env);
    await assertStates(env, taskNames, "active", "start");

    await run(["uninstall"], env);
    const finalStates = await schedulerStates(env, taskNames);
    if (finalStates.size !== 0) {
      throw new Error("Expected no scheduled jobs after uninstall.");
    }

    console.log("Live Windows scheduler smoke test passed.");
  } finally {
    await cleanupTask(taskNames.daily);
    await cleanupTask(taskNames.weekly);
    await Deno.remove(tempDir, { recursive: true }).catch(() => undefined);
  }
}

async function assertStates(
  env: Record<string, string>,
  taskNames: { daily: string; weekly: string },
  expected: string,
  action: string,
): Promise<void> {
  const states = await schedulerStates(env, taskNames);
  for (const [name, state] of states) {
    if (state !== expected) {
      throw new Error(`schedule ${action} failed: expected ${name}=${expected}, got ${state}`);
    }
  }
}

async function schedulerStates(
  env: Record<string, string>,
  taskNames: { daily: string; weekly: string },
): Promise<Map<string, string>> {
  const out = await run(["schedule", "status"], env);
  const states = new Map<string, string>();
  for (const line of out.trim().split("\n")) {
    const parts = line.split(":").map((part) => part.trim());
    if (parts.length !== 2) continue;
    const [label, state] = parts;
    if (label !== taskNames.daily && label !== taskNames.weekly) continue;
    states.set(label, state);
  }
  return states;
}

async function run(args: string[], env: Record<string, string>): Promise<string> {
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", "src/main.ts", ...args],
    env,
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const stdout = new TextDecoder().decode(out.stdout);
  const stderr = new TextDecoder().decode(out.stderr);
  if (!out.success) {
    const detail = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
    throw new Error(`command failed: zen-backup ${args.join(" ")}\n${detail}`);
  }
  return stdout;
}

async function cleanupTask(name: string): Promise<void> {
  await new Deno.Command("schtasks", {
    args: ["/Delete", "/TN", name, "/F"],
    stdout: "null",
    stderr: "null",
  }).output().catch(() => undefined);
}
