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

async function installLaunchd(config: AppConfig, options: RuntimeOptions): Promise<SchedulerStatus> {
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
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  await Deno.remove(join(agentsDir, `.disabled-${DAILY_LABEL}`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${WEEKLY_LABEL}`)).catch(() => undefined);
  return {
    installed: true,
    labels: [DAILY_LABEL, WEEKLY_LABEL],
    states: {
      [DAILY_LABEL]: "active",
      [WEEKLY_LABEL]: "active",
    },
  };
}

async function uninstallLaunchd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  await Deno.remove(join(agentsDir, `${DAILY_LABEL}.plist`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `${WEEKLY_LABEL}.plist`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, ".zen-backup-loaded")).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${DAILY_LABEL}`)).catch(() => undefined);
  await Deno.remove(join(agentsDir, `.disabled-${WEEKLY_LABEL}`)).catch(() => undefined);
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
  const loadedMarker = join(agentsDir, ".zen-backup-loaded");
  const dailyInstalled = await exists(daily);
  const weeklyInstalled = await exists(weekly);
  const loaded = await exists(loadedMarker);
  const dailyPaused = await exists(join(agentsDir, `.disabled-${DAILY_LABEL}`));
  const weeklyPaused = await exists(join(agentsDir, `.disabled-${WEEKLY_LABEL}`));
  const installed = dailyInstalled && weeklyInstalled && loaded;

  const states: Record<string, "active" | "paused" | "not_installed"> = {};
  states[DAILY_LABEL] = !dailyInstalled ? "not_installed" : dailyPaused ? "paused" : "active";
  states[WEEKLY_LABEL] = !weeklyInstalled ? "not_installed" : weeklyPaused ? "paused" : "active";
  return {
    installed,
    labels: dailyInstalled || weeklyInstalled ? [DAILY_LABEL, WEEKLY_LABEL] : [],
    states,
  };
}

function resolveHome(options: RuntimeOptions): string {
  return options.env?.HOME ?? options.env?.USERPROFILE ?? Deno.cwd();
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
