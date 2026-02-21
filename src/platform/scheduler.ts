import { join } from "jsr:@std/path@1.1.4";
import type { AppConfig, Platform, RuntimeOptions } from "../types.ts";

export interface SchedulerStatus {
  installed: boolean;
  labels: string[];
  states: Record<string, "active" | "paused" | "not_installed">;
}

export const DAILY_LABEL = "com.prometheas.zen-backup.daily";
export const WEEKLY_LABEL = "com.prometheas.zen-backup.weekly";

export async function installScheduler(
  config: AppConfig,
  options: RuntimeOptions = {},
): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await installLaunchd(config, options);
  }
  return { installed: false, labels: [], states: {} };
}

export async function uninstallScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await uninstallLaunchd(options);
  }
  return { installed: false, labels: [], states: {} };
}

export async function startScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os !== "darwin") return { installed: false, labels: [], states: {} };

  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  const dailyPlist = join(agentsDir, `${DAILY_LABEL}.plist`);
  const weeklyPlist = join(agentsDir, `${WEEKLY_LABEL}.plist`);
  const hasPlists = await exists(dailyPlist) && await exists(weeklyPlist);
  if (!hasPlists) return await queryLaunchd(options);

  if (await shouldUseRealLaunchctl(options)) {
    const domain = await launchctlDomain(options);
    await launchctl(["enable", `${domain}/${DAILY_LABEL}`], options);
    await launchctl(["enable", `${domain}/${WEEKLY_LABEL}`], options);
  }

  await Deno.remove(join(agentsDir, `.disabled-${DAILY_LABEL}`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${WEEKLY_LABEL}`)).catch(() => undefined);
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  return await queryLaunchd(options);
}

export async function stopScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os !== "darwin") return { installed: false, labels: [], states: {} };

  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  const dailyPlist = join(agentsDir, `${DAILY_LABEL}.plist`);
  const weeklyPlist = join(agentsDir, `${WEEKLY_LABEL}.plist`);
  const hasPlists = await exists(dailyPlist) && await exists(weeklyPlist);
  if (!hasPlists) return await queryLaunchd(options);

  if (await shouldUseRealLaunchctl(options)) {
    const domain = await launchctlDomain(options);
    await launchctl(["disable", `${domain}/${DAILY_LABEL}`], options);
    await launchctl(["disable", `${domain}/${WEEKLY_LABEL}`], options);
  }

  await Deno.writeTextFile(join(agentsDir, `.disabled-${DAILY_LABEL}`), "1");
  await Deno.writeTextFile(join(agentsDir, `.disabled-${WEEKLY_LABEL}`), "1");
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  return await queryLaunchd(options);
}

export async function queryScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await queryLaunchd(options);
  }
  return { installed: false, labels: [], states: {} };
}

async function installLaunchd(
  config: AppConfig,
  options: RuntimeOptions,
): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  await Deno.mkdir(agentsDir, { recursive: true });

  const dailyPath = join(agentsDir, `${DAILY_LABEL}.plist`);
  const weeklyPath = join(agentsDir, `${WEEKLY_LABEL}.plist`);
  await Deno.writeTextFile(
    dailyPath,
    launchdTemplate({
      label: DAILY_LABEL,
      kind: "daily",
      hour: hourFromTime(config.schedule.daily_time),
      minute: minuteFromTime(config.schedule.daily_time),
      backupRoot: config.backup.local_path,
    }),
  );
  await Deno.writeTextFile(
    weeklyPath,
    launchdTemplate({
      label: WEEKLY_LABEL,
      kind: "weekly",
      hour: hourFromTime(config.schedule.weekly_time),
      minute: minuteFromTime(config.schedule.weekly_time),
      backupRoot: config.backup.local_path,
      weekday: weekdayNumber(config.schedule.weekly_day),
    }),
  );

  if (await shouldUseRealLaunchctl(options)) {
    const domain = await launchctlDomain(options);
    await launchctl(["bootout", domain, dailyPath], options).catch(() => undefined);
    await launchctl(["bootout", domain, weeklyPath], options).catch(() => undefined);
    await launchctl(["bootstrap", domain, dailyPath], options);
    await launchctl(["bootstrap", domain, weeklyPath], options);
    await launchctl(["enable", `${domain}/${DAILY_LABEL}`], options);
    await launchctl(["enable", `${domain}/${WEEKLY_LABEL}`], options);
  }
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  await Deno.remove(join(agentsDir, `.disabled-${DAILY_LABEL}`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${WEEKLY_LABEL}`)).catch(() => undefined);

  return await queryLaunchd(options);
}

async function uninstallLaunchd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  const dailyPath = join(agentsDir, `${DAILY_LABEL}.plist`);
  const weeklyPath = join(agentsDir, `${WEEKLY_LABEL}.plist`);

  if (await shouldUseRealLaunchctl(options)) {
    const domain = await launchctlDomain(options);
    await launchctl(["bootout", domain, dailyPath], options).catch(() => undefined);
    await launchctl(["bootout", domain, weeklyPath], options).catch(() => undefined);
  }

  await Deno.remove(join(agentsDir, ".zen-backup-loaded")).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${DAILY_LABEL}`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${WEEKLY_LABEL}`)).catch(() => undefined);
  await Deno.remove(dailyPath).catch(() => undefined);
  await Deno.remove(weeklyPath).catch(() => undefined);

  return {
    installed: false,
    labels: [],
    states: {
      [DAILY_LABEL]: "not_installed",
      [WEEKLY_LABEL]: "not_installed",
    },
  };
}

async function queryLaunchd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  const daily = join(agentsDir, `${DAILY_LABEL}.plist`);
  const weekly = join(agentsDir, `${WEEKLY_LABEL}.plist`);
  const dailyInstalled = await exists(daily);
  const weeklyInstalled = await exists(weekly);
  const loadedMarker = join(agentsDir, ".zen-backup-loaded");
  const markerLoaded = await exists(loadedMarker);
  let dailyPaused = false;
  let weeklyPaused = false;
  let dailyLoaded = false;
  let weeklyLoaded = false;

  if (await shouldUseRealLaunchctl(options)) {
    const domain = await launchctlDomain(options);
    dailyPaused = await exists(join(agentsDir, `.disabled-${DAILY_LABEL}`));
    weeklyPaused = await exists(join(agentsDir, `.disabled-${WEEKLY_LABEL}`));
    const disabled = await launchctlOptional(["print-disabled", domain], options);
    if (disabled) {
      dailyPaused = labelDisabled(disabled, DAILY_LABEL);
      weeklyPaused = labelDisabled(disabled, WEEKLY_LABEL);
    }
    if (dailyInstalled) {
      dailyLoaded =
        (await launchctlOptional(["print", `${domain}/${DAILY_LABEL}`], options)) !== null ||
        markerLoaded;
    }
    if (weeklyInstalled) {
      weeklyLoaded =
        (await launchctlOptional(["print", `${domain}/${WEEKLY_LABEL}`], options)) !== null ||
        markerLoaded;
    }
  } else {
    dailyPaused = await exists(join(agentsDir, `.disabled-${DAILY_LABEL}`));
    weeklyPaused = await exists(join(agentsDir, `.disabled-${WEEKLY_LABEL}`));
    dailyLoaded = markerLoaded && dailyInstalled;
    weeklyLoaded = markerLoaded && weeklyInstalled;
  }

  const states: Record<string, "active" | "paused" | "not_installed"> = {};
  states[DAILY_LABEL] = resolveState(dailyInstalled, dailyPaused, dailyLoaded);
  states[WEEKLY_LABEL] = resolveState(weeklyInstalled, weeklyPaused, weeklyLoaded);
  return {
    installed: dailyInstalled && weeklyInstalled,
    labels: dailyInstalled || weeklyInstalled ? [DAILY_LABEL, WEEKLY_LABEL] : [],
    states,
  };
}

function resolveHome(options: RuntimeOptions): string {
  const env = options.env ?? Deno.env.toObject();
  return env.HOME ?? env.USERPROFILE ?? Deno.cwd();
}

async function shouldUseRealLaunchctl(options: RuntimeOptions): Promise<boolean> {
  if (options.env?.ZEN_BACKUP_FORCE_SIMULATED_LAUNCHCTL === "1") {
    return false;
  }
  const os = options.os ?? (Deno.build.os as Platform);
  if (os !== "darwin") return false;
  const runtimeHome = resolveHome(options);
  const processHome = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (processHome && runtimeHome !== processHome) return false;
  return await commandExists("launchctl", options);
}

async function launchctlDomain(options: RuntimeOptions): Promise<string> {
  const out = await commandOptional("id", ["-u"], options);
  const uid = out?.trim().length ? out.trim() : "501";
  return `gui/${uid}`;
}

async function launchctl(args: string[], options: RuntimeOptions): Promise<string> {
  const out = await new Deno.Command("launchctl", {
    args,
    env: commandEnv(options),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    const stderr = new TextDecoder().decode(out.stderr).trim();
    throw new Error(`launchctl ${args.join(" ")} failed: ${stderr}`);
  }
  return new TextDecoder().decode(out.stdout);
}

async function launchctlOptional(args: string[], options: RuntimeOptions): Promise<string | null> {
  const out = await new Deno.Command("launchctl", {
    args,
    env: commandEnv(options),
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return null;
  return new TextDecoder().decode(out.stdout);
}

function labelDisabled(printDisabledOutput: string, label: string): boolean {
  const lines = printDisabledOutput.split("\n").map((line) => line.trim());
  for (const line of lines) {
    if (!line.includes(label)) continue;
    if (line.includes("=> true") || line.includes("= true")) return true;
    if (line.includes("=> false") || line.includes("= false")) return false;
  }
  return false;
}

async function commandExists(binary: string, options: RuntimeOptions): Promise<boolean> {
  const out = await new Deno.Command("sh", {
    args: ["-lc", `command -v ${binary}`],
    env: commandEnv(options),
    stdout: "null",
    stderr: "null",
  }).output();
  return out.success;
}

async function commandOptional(
  binary: string,
  args: string[],
  options: RuntimeOptions,
): Promise<string | null> {
  const out = await new Deno.Command(binary, {
    args,
    env: commandEnv(options),
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return null;
  return new TextDecoder().decode(out.stdout);
}

function commandEnv(options: RuntimeOptions): Record<string, string> | undefined {
  const env = options.env;
  if (!env) return undefined;
  return Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >;
}

function resolveState(
  installed: boolean,
  paused: boolean,
  loaded: boolean,
): "active" | "paused" | "not_installed" {
  if (!installed) return "not_installed";
  if (paused) return "paused";
  if (!loaded) return "paused";
  return "active";
}

function hourFromTime(time: string): number {
  return Number(time.split(":")[0] ?? "0");
}

function minuteFromTime(time: string): number {
  return Number(time.split(":")[1] ?? "0");
}

function weekdayNumber(day: string): number {
  const normalized = day.toLowerCase();
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[normalized] ?? 0;
}

function launchdTemplate(input: {
  label: string;
  kind: "daily" | "weekly";
  hour: number;
  minute: number;
  backupRoot: string;
  weekday?: number;
}): string {
  const dayOfWeekLine = input.weekday === undefined
    ? ""
    : `    <key>Weekday</key>\n    <integer>${input.weekday}</integer>\n`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${input.label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>zen-backup</string>
    <string>backup</string>
    <string>${input.kind}</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
${dayOfWeekLine}    <key>Hour</key>
    <integer>${input.hour}</integer>
    <key>Minute</key>
    <integer>${input.minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${join(input.backupRoot, "backup.log")}</string>
  <key>StandardErrorPath</key>
  <string>${join(input.backupRoot, "backup.log")}</string>
</dict>
</plist>
`;
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
