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
    await assertNativeInstalled(taskNames, env, "install");

    await run(["schedule", "stop"], env);
    await warnIfStopDidNotPause(taskNames, env);

    await run(["schedule", "start"], env);
    await assertNativeInstalled(taskNames, env, "start");

    await run(["uninstall"], env);
    const daily = await queryNativeTask(taskNames.daily, env);
    const weekly = await queryNativeTask(taskNames.weekly, env);
    if (daily.installed || weekly.installed) {
      throw new Error(
        [
          "Expected no scheduled jobs after uninstall.",
          `daily installed: ${daily.installed}`,
          `weekly installed: ${weekly.installed}`,
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

async function assertNativeStates(
  env: Record<string, string>,
  taskNames: TaskNames,
  expected: "active" | "paused",
  action: string,
): Promise<void> {
  const expectedEnabled = expected === "active";
  await waitForExpectedStates(
    async () => {
      const daily = await queryNativeTask(taskNames.daily, env);
      const weekly = await queryNativeTask(taskNames.weekly, env);
      const lines = [
        `${taskNames.daily}: installed=${daily.installed} enabled=${daily.enabled}`,
        `${taskNames.weekly}: installed=${weekly.installed} enabled=${weekly.enabled}`,
      ];
      const states = new Map<string, string>();
      if (daily.installed) states.set(taskNames.daily, daily.enabled ? "active" : "paused");
      if (weekly.installed) states.set(taskNames.weekly, weekly.enabled ? "active" : "paused");
      return { states, raw: lines.join("\n") };
    },
    taskNames,
    expectedEnabled ? "active" : "paused",
    action,
    8,
    400,
  );
}

async function assertNativeInstalled(
  taskNames: TaskNames,
  env: Record<string, string>,
  action: string,
): Promise<void> {
  const daily = await queryNativeTask(taskNames.daily, env);
  const weekly = await queryNativeTask(taskNames.weekly, env);
  if (!daily.installed || !weekly.installed) {
    throw new Error(
      [
        `schedule ${action} failed: expected both tasks installed`,
        `${taskNames.daily}: installed=${daily.installed} enabled=${daily.enabled}`,
        `${taskNames.weekly}: installed=${weekly.installed} enabled=${weekly.enabled}`,
      ].join("\n"),
    );
  }
}

async function warnIfStopDidNotPause(
  taskNames: TaskNames,
  env: Record<string, string>,
): Promise<void> {
  const daily = await queryNativeTask(taskNames.daily, env);
  const weekly = await queryNativeTask(taskNames.weekly, env);
  if (daily.enabled || weekly.enabled) {
    console.error(
      [
        "Warning: scheduler stop did not report disabled state via native query.",
        `${taskNames.daily}: installed=${daily.installed} enabled=${daily.enabled}`,
        `${taskNames.weekly}: installed=${weekly.installed} enabled=${weekly.enabled}`,
      ].join("\n"),
    );
  }
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

async function queryNativeTask(
  taskName: string,
  env: Record<string, string>,
): Promise<{ installed: boolean; enabled: boolean }> {
  const verboseOut = await new Deno.Command("schtasks", {
    args: ["/Query", "/TN", taskName, "/V", "/FO", "LIST"],
    env,
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => undefined);
  if (verboseOut?.success) {
    const verbose = new TextDecoder().decode(verboseOut.stdout);
    const parsedEnabled = parseSchtasksEnabledFromListOutput(verbose);
    if (parsedEnabled !== null) {
      return { installed: true, enabled: parsedEnabled };
    }
  }

  const out = await new Deno.Command("schtasks", {
    args: ["/Query", "/TN", taskName, "/XML"],
    env,
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => undefined);
  if (!out || !out.success) {
    return { installed: false, enabled: false };
  }
  const xml = new TextDecoder().decode(out.stdout);
  const enabledMatch = /<Enabled>\s*(true|false)\s*<\/Enabled>/i.exec(xml);
  if (!enabledMatch) {
    return { installed: true, enabled: true };
  }
  return {
    installed: true,
    enabled: enabledMatch[1].toLowerCase() === "true",
  };
}

export function parseSchtasksEnabledFromListOutput(output: string): boolean | null {
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim().toLowerCase();
    if (!line.includes("scheduled task state:") && !line.startsWith("status:")) continue;
    if (line.includes("disabled")) return false;
    if (line.includes("enabled") || line.includes("ready") || line.includes("running")) return true;
  }
  return null;
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
