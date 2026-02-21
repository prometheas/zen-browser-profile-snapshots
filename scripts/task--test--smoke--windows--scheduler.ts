const SMOKE_FLAG = "ZEN_BACKUP_LIVE_SMOKE";
type TaskNames = { daily: string; weekly: string };
type SchedulerSnapshot = { states: Map<string, string>; raw: string };
type PreflightDiagnostics = {
  denoVersion: string;
  smokeFlagEnabled: boolean;
  hasSchtasks: boolean;
  configPath: string;
  profileDir: string;
  taskPrefix: string;
  taskNames: TaskNames;
  existingTasks: string[];
};

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
  const taskNames: TaskNames = {
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
    const preflight = await collectPreflight(taskPrefix, taskNames, configPath, profileDir);
    console.log(formatPreflight(preflight));

    await run(["install"], env);
    await assertStates(env, taskNames, "active", "install");

    await run(["schedule", "stop"], env);
    await assertStates(env, taskNames, "paused", "stop");

    await run(["schedule", "start"], env);
    await assertStates(env, taskNames, "active", "start");

    await run(["uninstall"], env);
    const finalSnapshot = await schedulerStates(env, taskNames);
    if (finalSnapshot.states.size !== 0) {
      throw new Error(
        [
          "Expected no scheduled jobs after uninstall.",
          "Raw schedule status output:",
          finalSnapshot.raw.trim(),
        ].join("\n"),
      );
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
  taskNames: TaskNames,
  expected: string,
  action: string,
): Promise<void> {
  await waitForExpectedStates(
    () => schedulerStates(env, taskNames),
    taskNames,
    expected,
    action,
    8,
    400,
  );
}

async function schedulerStates(
  env: Record<string, string>,
  taskNames: TaskNames,
): Promise<SchedulerSnapshot> {
  const out = await run(["schedule", "status"], env);
  return {
    states: parseSchedulerStates(out, taskNames),
    raw: out,
  };
}

export function parseSchedulerStates(output: string, taskNames: TaskNames): Map<string, string> {
  const states = new Map<string, string>();
  for (const line of output.trim().split("\n")) {
    const parts = line.split(":").map((part) => part.trim());
    if (parts.length !== 2) continue;
    const [label, state] = parts;
    if (label !== taskNames.daily && label !== taskNames.weekly) continue;
    states.set(label, state);
  }
  return states;
}

export function validateSchedulerStates(
  states: Map<string, string>,
  taskNames: TaskNames,
  expected: string,
  action: string,
  rawStatusOutput: string,
): void {
  const expectedNames = [taskNames.daily, taskNames.weekly];
  const missing = expectedNames.filter((name) => !states.has(name));
  if (missing.length > 0) {
    throw new Error(
      [
        `schedule ${action} failed: missing tasks: ${missing.join(", ")}`,
        "Raw schedule status output:",
        rawStatusOutput.trim(),
      ].join("\n"),
    );
  }

  for (const name of expectedNames) {
    const state = states.get(name);
    if (state !== expected) {
      throw new Error(
        [
          `schedule ${action} failed: expected ${name}=${expected}, got ${state}`,
          "Raw schedule status output:",
          rawStatusOutput.trim(),
        ].join("\n"),
      );
    }
  }
}

export async function waitForExpectedStates(
  readStates: () => Promise<SchedulerSnapshot>,
  taskNames: TaskNames,
  expected: string,
  action: string,
  attempts: number,
  delayMs: number,
): Promise<void> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const snapshot = await readStates();
    try {
      validateSchedulerStates(snapshot.states, taskNames, expected, action, snapshot.raw);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError ?? new Error(`schedule ${action} failed`);
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
    throw new Error(
      [
        `command failed: zen-backup ${args.join(" ")}`,
        "stdout:",
        stdout.trim() || "<empty>",
        "stderr:",
        stderr.trim() || "<empty>",
      ].join("\n"),
    );
  }
  return stdout;
}

async function collectPreflight(
  taskPrefix: string,
  taskNames: TaskNames,
  configPath: string,
  profileDir: string,
): Promise<PreflightDiagnostics> {
  const whereSchtasks = await new Deno.Command("where", {
    args: ["schtasks"],
    stdout: "null",
    stderr: "null",
  }).output().catch(() => ({ success: false }));

  const existingTasks = await listTasksWithPrefix(taskPrefix);
  return {
    denoVersion: Deno.version.deno,
    smokeFlagEnabled: Deno.env.get(SMOKE_FLAG) === "1",
    hasSchtasks: Boolean(whereSchtasks.success),
    configPath,
    profileDir,
    taskPrefix,
    taskNames,
    existingTasks,
  };
}

function formatPreflight(diagnostics: PreflightDiagnostics): string {
  return [
    "Windows scheduler smoke preflight:",
    `- Deno: ${diagnostics.denoVersion}`,
    `- ${SMOKE_FLAG}: ${diagnostics.smokeFlagEnabled ? "enabled" : "disabled"}`,
    `- schtasks available: ${diagnostics.hasSchtasks ? "yes" : "no"}`,
    `- config path: ${diagnostics.configPath}`,
    `- profile path: ${diagnostics.profileDir}`,
    `- task prefix: ${diagnostics.taskPrefix}`,
    `- daily task: ${diagnostics.taskNames.daily}`,
    `- weekly task: ${diagnostics.taskNames.weekly}`,
    diagnostics.existingTasks.length === 0
      ? "- existing tasks with prefix: none"
      : `- existing tasks with prefix: ${diagnostics.existingTasks.join(", ")}`,
  ].join("\n");
}

async function listTasksWithPrefix(prefix: string): Promise<string[]> {
  const out = await new Deno.Command("schtasks", {
    args: ["/Query", "/FO", "CSV", "/NH"],
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => undefined);
  if (!out || !out.success) return [];

  const text = new TextDecoder().decode(out.stdout);
  const matches = new Set<string>();
  for (const line of text.split("\n")) {
    const firstComma = line.indexOf(",");
    if (firstComma <= 1) continue;
    const rawName = line.slice(0, firstComma).trim().replace(/^"|"$/g, "");
    const normalized = rawName.replace(/^\\+/, "");
    if (!normalized.includes(prefix)) continue;
    matches.add(normalized);
  }
  return [...matches].sort();
}

async function cleanupTask(name: string): Promise<void> {
  await new Deno.Command("schtasks", {
    args: ["/Delete", "/TN", name, "/F"],
    stdout: "null",
    stderr: "null",
  }).output().catch(() => undefined);
}
