import { join } from "jsr:@std/path@1.1.4";
import type { AppConfig, Platform, RuntimeOptions } from "../types.ts";

export interface SchedulerStatus {
  installed: boolean;
  labels: string[];
}

export async function installScheduler(
  config: AppConfig,
  options: RuntimeOptions = {},
): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await installLaunchd(config, options);
  }
  return { installed: false, labels: [] };
}

export async function uninstallScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await uninstallLaunchd(options);
  }
  return { installed: false, labels: [] };
}

export async function queryScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await queryLaunchd(options);
  }
  return { installed: false, labels: [] };
}

async function installLaunchd(config: AppConfig, options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  await Deno.mkdir(agentsDir, { recursive: true });

  const dailyPath = join(agentsDir, "com.zen-backup.daily.plist");
  const weeklyPath = join(agentsDir, "com.zen-backup.weekly.plist");
  await Deno.writeTextFile(
    dailyPath,
    launchdTemplate({
      label: "com.zen-backup.daily",
      kind: "daily",
      hour: hourFromTime(config.schedule.daily_time),
      minute: minuteFromTime(config.schedule.daily_time),
      backupRoot: config.backup.local_path,
    }),
  );
  await Deno.writeTextFile(
    weeklyPath,
    launchdTemplate({
      label: "com.zen-backup.weekly",
      kind: "weekly",
      hour: hourFromTime(config.schedule.weekly_time),
      minute: minuteFromTime(config.schedule.weekly_time),
      backupRoot: config.backup.local_path,
      weekday: weekdayNumber(config.schedule.weekly_day),
    }),
  );
  await Deno.writeTextFile(join(agentsDir, ".zen-backup-loaded"), "1");
  return { installed: true, labels: ["com.zen-backup.daily", "com.zen-backup.weekly"] };
}

async function uninstallLaunchd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  await Deno.remove(join(agentsDir, "com.zen-backup.daily.plist")).catch(() => undefined);
  await Deno.remove(join(agentsDir, "com.zen-backup.weekly.plist")).catch(() => undefined);
  await Deno.remove(join(agentsDir, ".zen-backup-loaded")).catch(() => undefined);
  return { installed: false, labels: [] };
}

async function queryLaunchd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const agentsDir = join(resolveHome(options), "Library", "LaunchAgents");
  const daily = join(agentsDir, "com.zen-backup.daily.plist");
  const weekly = join(agentsDir, "com.zen-backup.weekly.plist");
  const loadedMarker = join(agentsDir, ".zen-backup-loaded");
  const installed = await exists(daily) && await exists(weekly) && await exists(loadedMarker);
  return {
    installed,
    labels: installed ? ["com.zen-backup.daily", "com.zen-backup.weekly"] : [],
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
