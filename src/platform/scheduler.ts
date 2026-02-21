import { join } from "jsr:@std/path@1.1.4";
import type { AppConfig, Platform, RuntimeOptions } from "../types.ts";

export interface SchedulerStatus {
  installed: boolean;
  labels: string[];
  states: Record<string, "active" | "paused" | "not_installed">;
}

export const DAILY_LABEL = "com.prometheas.zen-backup.daily";
export const WEEKLY_LABEL = "com.prometheas.zen-backup.weekly";
export const DAILY_TIMER = "zen-backup-daily.timer";
export const WEEKLY_TIMER = "zen-backup-weekly.timer";
export const DAILY_TASK = "ZenBackupDaily";
export const WEEKLY_TASK = "ZenBackupWeekly";

export async function installScheduler(
  config: AppConfig,
  options: RuntimeOptions = {},
): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await installLaunchd(config, options);
  }
  if (os === "linux") {
    return await installSystemd(config, options);
  }
  if (os === "windows") {
    return await installWindows(config, options);
  }
  return { installed: false, labels: [], states: {} };
}

export async function uninstallScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "darwin") {
    return await uninstallLaunchd(options);
  }
  if (os === "linux") {
    return await uninstallSystemd(options);
  }
  if (os === "windows") {
    return await uninstallWindows(options);
  }
  return { installed: false, labels: [], states: {} };
}

export async function startScheduler(options: RuntimeOptions = {}): Promise<SchedulerStatus> {
  const os = options.os ?? (Deno.build.os as Platform);
  if (os === "linux") return await startSystemd(options);
  if (os === "windows") return await startWindows(options);
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
  if (os === "linux") return await stopSystemd(options);
  if (os === "windows") return await stopWindows(options);
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
  if (os === "linux") {
    return await querySystemd(options);
  }
  if (os === "windows") {
    return await queryWindows(options);
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

async function installSystemd(
  config: AppConfig,
  options: RuntimeOptions,
): Promise<SchedulerStatus> {
  const systemdDir = join(resolveHome(options), ".config", "systemd", "user");
  await Deno.mkdir(systemdDir, { recursive: true });

  const dailyTimerPath = join(systemdDir, DAILY_TIMER);
  const weeklyTimerPath = join(systemdDir, WEEKLY_TIMER);
  const dailyServicePath = join(systemdDir, "zen-backup-daily.service");
  const weeklyServicePath = join(systemdDir, "zen-backup-weekly.service");

  await Deno.writeTextFile(dailyServicePath, systemdServiceTemplate("daily"));
  await Deno.writeTextFile(weeklyServicePath, systemdServiceTemplate("weekly"));
  await Deno.writeTextFile(
    dailyTimerPath,
    systemdDailyTimerTemplate({
      hour: hourFromTime(config.schedule.daily_time),
      minute: minuteFromTime(config.schedule.daily_time),
    }),
  );
  await Deno.writeTextFile(
    weeklyTimerPath,
    systemdWeeklyTimerTemplate({
      hour: hourFromTime(config.schedule.weekly_time),
      minute: minuteFromTime(config.schedule.weekly_time),
      weekday: weekdayAbbrev(config.schedule.weekly_day),
    }),
  );

  if (await shouldUseRealSystemctl(options)) {
    await systemctl(["--user", "daemon-reload"], options);
    await systemctl(["--user", "enable", "--now", DAILY_TIMER], options);
    await systemctl(["--user", "enable", "--now", WEEKLY_TIMER], options);
  }

  await Deno.writeTextFile(join(systemdDir, ".zen-backup-loaded"), "1");
  await Deno.remove(join(systemdDir, `.disabled-${DAILY_TIMER}`)).catch(() => undefined);
  await Deno.remove(join(systemdDir, `.disabled-${WEEKLY_TIMER}`)).catch(() => undefined);
  return await querySystemd(options);
}

async function uninstallSystemd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const systemdDir = join(resolveHome(options), ".config", "systemd", "user");
  const dailyTimerPath = join(systemdDir, DAILY_TIMER);
  const weeklyTimerPath = join(systemdDir, WEEKLY_TIMER);
  const dailyServicePath = join(systemdDir, "zen-backup-daily.service");
  const weeklyServicePath = join(systemdDir, "zen-backup-weekly.service");

  if (await shouldUseRealSystemctl(options)) {
    await systemctl(["--user", "disable", "--now", DAILY_TIMER], options).catch(() => undefined);
    await systemctl(["--user", "disable", "--now", WEEKLY_TIMER], options).catch(() => undefined);
    await systemctl(["--user", "daemon-reload"], options).catch(() => undefined);
  }

  await Deno.remove(join(systemdDir, ".zen-backup-loaded")).catch(() => undefined);
  await Deno.remove(join(systemdDir, `.disabled-${DAILY_TIMER}`)).catch(() => undefined);
  await Deno.remove(join(systemdDir, `.disabled-${WEEKLY_TIMER}`)).catch(() => undefined);
  await Deno.remove(dailyTimerPath).catch(() => undefined);
  await Deno.remove(weeklyTimerPath).catch(() => undefined);
  await Deno.remove(dailyServicePath).catch(() => undefined);
  await Deno.remove(weeklyServicePath).catch(() => undefined);

  return {
    installed: false,
    labels: [],
    states: {
      [DAILY_TIMER]: "not_installed",
      [WEEKLY_TIMER]: "not_installed",
    },
  };
}

async function startSystemd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const systemdDir = join(resolveHome(options), ".config", "systemd", "user");
  const dailyTimerPath = join(systemdDir, DAILY_TIMER);
  const weeklyTimerPath = join(systemdDir, WEEKLY_TIMER);
  const hasTimers = await exists(dailyTimerPath) && await exists(weeklyTimerPath);
  if (!hasTimers) return await querySystemd(options);

  if (await shouldUseRealSystemctl(options)) {
    await systemctl(["--user", "enable", "--now", DAILY_TIMER], options);
    await systemctl(["--user", "enable", "--now", WEEKLY_TIMER], options);
  }

  await Deno.remove(join(systemdDir, `.disabled-${DAILY_TIMER}`)).catch(() => undefined);
  await Deno.remove(join(systemdDir, `.disabled-${WEEKLY_TIMER}`)).catch(() => undefined);
  await Deno.writeTextFile(join(systemdDir, ".zen-backup-loaded"), "1");
  return await querySystemd(options);
}

async function stopSystemd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const systemdDir = join(resolveHome(options), ".config", "systemd", "user");
  const dailyTimerPath = join(systemdDir, DAILY_TIMER);
  const weeklyTimerPath = join(systemdDir, WEEKLY_TIMER);
  const hasTimers = await exists(dailyTimerPath) && await exists(weeklyTimerPath);
  if (!hasTimers) return await querySystemd(options);

  if (await shouldUseRealSystemctl(options)) {
    await systemctl(["--user", "disable", "--now", DAILY_TIMER], options);
    await systemctl(["--user", "disable", "--now", WEEKLY_TIMER], options);
  }

  await Deno.writeTextFile(join(systemdDir, `.disabled-${DAILY_TIMER}`), "1");
  await Deno.writeTextFile(join(systemdDir, `.disabled-${WEEKLY_TIMER}`), "1");
  await Deno.writeTextFile(join(systemdDir, ".zen-backup-loaded"), "1");
  return await querySystemd(options);
}

async function querySystemd(options: RuntimeOptions): Promise<SchedulerStatus> {
  const systemdDir = join(resolveHome(options), ".config", "systemd", "user");
  const dailyTimerPath = join(systemdDir, DAILY_TIMER);
  const weeklyTimerPath = join(systemdDir, WEEKLY_TIMER);
  const dailyInstalled = await exists(dailyTimerPath);
  const weeklyInstalled = await exists(weeklyTimerPath);
  const markerLoaded = await exists(join(systemdDir, ".zen-backup-loaded"));
  let dailyPaused = await exists(join(systemdDir, `.disabled-${DAILY_TIMER}`));
  let weeklyPaused = await exists(join(systemdDir, `.disabled-${WEEKLY_TIMER}`));
  let dailyLoaded = markerLoaded && dailyInstalled;
  let weeklyLoaded = markerLoaded && weeklyInstalled;

  if (await shouldUseRealSystemctl(options)) {
    const dailyEnabled = await systemctlOptional(["--user", "is-enabled", DAILY_TIMER], options);
    const weeklyEnabled = await systemctlOptional(["--user", "is-enabled", WEEKLY_TIMER], options);
    const dailyActive = await systemctlOptional(["--user", "is-active", DAILY_TIMER], options);
    const weeklyActive = await systemctlOptional(["--user", "is-active", WEEKLY_TIMER], options);
    if (dailyEnabled !== null) dailyPaused = !dailyEnabled.trim().startsWith("enabled");
    if (weeklyEnabled !== null) weeklyPaused = !weeklyEnabled.trim().startsWith("enabled");
    if (dailyActive !== null) dailyLoaded = dailyActive.trim().startsWith("active");
    if (weeklyActive !== null) weeklyLoaded = weeklyActive.trim().startsWith("active");
  }

  const states: Record<string, "active" | "paused" | "not_installed"> = {};
  states[DAILY_TIMER] = resolveState(dailyInstalled, dailyPaused, dailyLoaded);
  states[WEEKLY_TIMER] = resolveState(weeklyInstalled, weeklyPaused, weeklyLoaded);

  return {
    installed: dailyInstalled && weeklyInstalled,
    labels: dailyInstalled || weeklyInstalled ? [DAILY_TIMER, WEEKLY_TIMER] : [],
    states,
  };
}

async function installWindows(
  config: AppConfig,
  options: RuntimeOptions,
): Promise<SchedulerStatus> {
  if (await shouldUseRealWindowsScheduler(options)) {
    return await installWindowsReal(config, options);
  }
  return await installWindowsSimulated(config, options);
}

async function installWindowsSimulated(
  config: AppConfig,
  options: RuntimeOptions,
): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const schedulerDir = resolveWindowsSchedulerDir(options);
  await Deno.mkdir(schedulerDir, { recursive: true });

  await writeWindowsTask(schedulerDir, names.daily, {
    kind: "daily",
    dailyTime: config.schedule.daily_time,
    weeklyDay: undefined,
    weeklyTime: undefined,
  });
  await writeWindowsTask(schedulerDir, names.weekly, {
    kind: "weekly",
    dailyTime: undefined,
    weeklyDay: config.schedule.weekly_day,
    weeklyTime: config.schedule.weekly_time,
  });

  await Deno.remove(join(schedulerDir, `.disabled-${names.daily}`)).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `.disabled-${names.weekly}`)).catch(() => undefined);
  await Deno.writeTextFile(join(schedulerDir, ".zen-backup-loaded"), "1");

  return await queryWindows(options);
}

async function uninstallWindows(options: RuntimeOptions): Promise<SchedulerStatus> {
  if (await shouldUseRealWindowsScheduler(options)) {
    return await uninstallWindowsReal(options);
  }
  return await uninstallWindowsSimulated(options);
}

async function uninstallWindowsSimulated(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const schedulerDir = resolveWindowsSchedulerDir(options);
  await Deno.remove(join(schedulerDir, ".zen-backup-loaded")).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `${names.daily}.json`)).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `${names.weekly}.json`)).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `.disabled-${names.daily}`)).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `.disabled-${names.weekly}`)).catch(() => undefined);

  return {
    installed: false,
    labels: [],
    states: {
      [names.daily]: "not_installed",
      [names.weekly]: "not_installed",
    },
  };
}

async function startWindows(options: RuntimeOptions): Promise<SchedulerStatus> {
  if (await shouldUseRealWindowsScheduler(options)) {
    return await startWindowsReal(options);
  }
  return await startWindowsSimulated(options);
}

async function startWindowsSimulated(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const schedulerDir = resolveWindowsSchedulerDir(options);
  const dailyTaskPath = join(schedulerDir, `${names.daily}.json`);
  const weeklyTaskPath = join(schedulerDir, `${names.weekly}.json`);
  const hasTasks = await exists(dailyTaskPath) && await exists(weeklyTaskPath);
  if (!hasTasks) return await queryWindows(options);

  await Deno.remove(join(schedulerDir, `.disabled-${names.daily}`)).catch(() => undefined);
  await Deno.remove(join(schedulerDir, `.disabled-${names.weekly}`)).catch(() => undefined);
  await Deno.writeTextFile(join(schedulerDir, ".zen-backup-loaded"), "1");
  return await queryWindows(options);
}

async function stopWindows(options: RuntimeOptions): Promise<SchedulerStatus> {
  if (await shouldUseRealWindowsScheduler(options)) {
    return await stopWindowsReal(options);
  }
  return await stopWindowsSimulated(options);
}

async function stopWindowsSimulated(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const schedulerDir = resolveWindowsSchedulerDir(options);
  const dailyTaskPath = join(schedulerDir, `${names.daily}.json`);
  const weeklyTaskPath = join(schedulerDir, `${names.weekly}.json`);
  const hasTasks = await exists(dailyTaskPath) && await exists(weeklyTaskPath);
  if (!hasTasks) return await queryWindows(options);

  await Deno.writeTextFile(join(schedulerDir, `.disabled-${names.daily}`), "1");
  await Deno.writeTextFile(join(schedulerDir, `.disabled-${names.weekly}`), "1");
  await Deno.writeTextFile(join(schedulerDir, ".zen-backup-loaded"), "1");
  return await queryWindows(options);
}

async function queryWindows(options: RuntimeOptions): Promise<SchedulerStatus> {
  if (await shouldUseRealWindowsScheduler(options)) {
    return await queryWindowsReal(options);
  }
  return await queryWindowsSimulated(options);
}

async function queryWindowsSimulated(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const schedulerDir = resolveWindowsSchedulerDir(options);
  const dailyTaskPath = join(schedulerDir, `${names.daily}.json`);
  const weeklyTaskPath = join(schedulerDir, `${names.weekly}.json`);
  const dailyInstalled = await exists(dailyTaskPath);
  const weeklyInstalled = await exists(weeklyTaskPath);
  const markerLoaded = await exists(join(schedulerDir, ".zen-backup-loaded"));
  const dailyPaused = await exists(join(schedulerDir, `.disabled-${names.daily}`));
  const weeklyPaused = await exists(join(schedulerDir, `.disabled-${names.weekly}`));
  const states: Record<string, "active" | "paused" | "not_installed"> = {};
  states[names.daily] = resolveState(dailyInstalled, dailyPaused, markerLoaded && dailyInstalled);
  states[names.weekly] = resolveState(
    weeklyInstalled,
    weeklyPaused,
    markerLoaded && weeklyInstalled,
  );

  return {
    installed: dailyInstalled && weeklyInstalled,
    labels: dailyInstalled || weeklyInstalled ? [names.daily, names.weekly] : [],
    states,
  };
}

async function installWindowsReal(
  config: AppConfig,
  options: RuntimeOptions,
): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  await schtasks(
    [
      "/Create",
      "/TN",
      names.daily,
      "/TR",
      "zen-backup backup daily",
      "/SC",
      "DAILY",
      "/ST",
      normalizeWindowsTime(config.schedule.daily_time),
      "/F",
    ],
    options,
  );
  await schtasks(
    [
      "/Create",
      "/TN",
      names.weekly,
      "/TR",
      "zen-backup backup weekly",
      "/SC",
      "WEEKLY",
      "/D",
      windowsWeekday(config.schedule.weekly_day),
      "/ST",
      normalizeWindowsTime(config.schedule.weekly_time),
      "/F",
    ],
    options,
  );
  return await queryWindowsReal(options);
}

async function uninstallWindowsReal(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  await schtasksOptional(["/Delete", "/TN", names.daily, "/F"], options);
  await schtasksOptional(["/Delete", "/TN", names.weekly, "/F"], options);
  return {
    installed: false,
    labels: [],
    states: {
      [names.daily]: "not_installed",
      [names.weekly]: "not_installed",
    },
  };
}

async function startWindowsReal(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const daily = await queryWindowsTaskReal(names.daily, options);
  const weekly = await queryWindowsTaskReal(names.weekly, options);
  if (!daily.installed && !weekly.installed) return await queryWindowsReal(options);
  if (daily.installed) await schtasks(["/Change", "/TN", names.daily, "/ENABLE"], options);
  if (weekly.installed) await schtasks(["/Change", "/TN", names.weekly, "/ENABLE"], options);
  return await queryWindowsReal(options);
}

async function stopWindowsReal(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const daily = await queryWindowsTaskReal(names.daily, options);
  const weekly = await queryWindowsTaskReal(names.weekly, options);
  if (!daily.installed && !weekly.installed) return await queryWindowsReal(options);
  if (daily.installed) await schtasks(["/Change", "/TN", names.daily, "/DISABLE"], options);
  if (weekly.installed) await schtasks(["/Change", "/TN", names.weekly, "/DISABLE"], options);
  return await queryWindowsReal(options);
}

async function queryWindowsReal(options: RuntimeOptions): Promise<SchedulerStatus> {
  const names = windowsTaskNames(options);
  const daily = await queryWindowsTaskReal(names.daily, options);
  const weekly = await queryWindowsTaskReal(names.weekly, options);

  const states: Record<string, "active" | "paused" | "not_installed"> = {
    [names.daily]: daily.installed ? (daily.enabled ? "active" : "paused") : "not_installed",
    [names.weekly]: weekly.installed ? (weekly.enabled ? "active" : "paused") : "not_installed",
  };

  return {
    installed: daily.installed && weekly.installed,
    labels: daily.installed || weekly.installed ? [names.daily, names.weekly] : [],
    states,
  };
}

function resolveHome(options: RuntimeOptions): string {
  const env = options.env ?? Deno.env.toObject();
  return env.HOME ?? env.USERPROFILE ?? Deno.cwd();
}

function windowsTaskNames(options: RuntimeOptions): { daily: string; weekly: string } {
  const prefix = options.env?.ZEN_BACKUP_WINDOWS_TASK_PREFIX?.trim();
  if (!prefix) {
    return { daily: DAILY_TASK, weekly: WEEKLY_TASK };
  }
  return { daily: `${prefix}Daily`, weekly: `${prefix}Weekly` };
}

function resolveWindowsSchedulerDir(options: RuntimeOptions): string {
  const env = options.env ?? Deno.env.toObject();
  const appData = env.APPDATA ?? join(resolveHome(options), "AppData", "Roaming");
  return join(appData, "zen-profile-backup", "task-scheduler");
}

async function writeWindowsTask(
  schedulerDir: string,
  name: string,
  schedule: {
    kind: "daily" | "weekly";
    dailyTime?: string;
    weeklyDay?: string;
    weeklyTime?: string;
  },
): Promise<void> {
  const payload = {
    name,
    command: `zen-backup backup ${schedule.kind}`,
    userContext: "current-user",
    schedule: {
      dailyTime: schedule.dailyTime ?? null,
      weeklyDay: schedule.weeklyDay ?? null,
      weeklyTime: schedule.weeklyTime ?? null,
    },
  };
  await Deno.writeTextFile(join(schedulerDir, `${name}.json`), JSON.stringify(payload, null, 2));
}

async function shouldUseRealWindowsScheduler(options: RuntimeOptions): Promise<boolean> {
  if (options.env?.ZEN_BACKUP_FORCE_SIMULATED_WINDOWS_SCHEDULER === "1") {
    return false;
  }
  const os = options.os ?? (Deno.build.os as Platform);
  if (os !== "windows") return false;

  const processHome = Deno.env.get("USERPROFILE") ?? Deno.env.get("HOME");
  const runtimeHome = resolveHome(options);
  if (processHome && processHome !== runtimeHome) return false;

  const processAppData = Deno.env.get("APPDATA");
  const runtimeAppData = options.env?.APPDATA;
  if (processAppData && runtimeAppData && processAppData !== runtimeAppData) return false;

  if (!(await commandExistsWindows("schtasks", options))) return false;
  return (await commandExistsWindows("powershell", options)) ||
    (await commandExistsWindows("pwsh", options));
}

async function queryWindowsTaskReal(
  taskName: string,
  options: RuntimeOptions,
): Promise<{ installed: boolean; enabled: boolean }> {
  const script = `$task = Get-ScheduledTask -TaskName '${
    escapePowerShellSingleQuoted(taskName)
  }' -ErrorAction SilentlyContinue; if ($null -eq $task) { '{"installed":false,"enabled":false}' } else { [pscustomobject]@{installed=$true;enabled=[bool]$task.Settings.Enabled} | ConvertTo-Json -Compress }`;
  const json = await powerShellOptional(script, options);
  if (!json) return { installed: false, enabled: false };
  try {
    const parsed = JSON.parse(json.trim()) as { installed?: boolean; enabled?: boolean };
    return {
      installed: parsed.installed === true,
      enabled: parsed.enabled === true,
    };
  } catch {
    return { installed: false, enabled: false };
  }
}

async function schtasks(args: string[], options: RuntimeOptions): Promise<string> {
  const out = await new Deno.Command("schtasks", {
    args,
    env: commandEnv(options),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    const stderr = new TextDecoder().decode(out.stderr).trim();
    throw new Error(`schtasks ${args.join(" ")} failed: ${stderr}`);
  }
  return new TextDecoder().decode(out.stdout);
}

async function schtasksOptional(args: string[], options: RuntimeOptions): Promise<string | null> {
  try {
    const out = await new Deno.Command("schtasks", {
      args,
      env: commandEnv(options),
      stdout: "piped",
      stderr: "null",
    }).output();
    if (!out.success) return null;
    return new TextDecoder().decode(out.stdout);
  } catch {
    return null;
  }
}

async function commandExistsWindows(binary: string, options: RuntimeOptions): Promise<boolean> {
  try {
    const out = await new Deno.Command("where", {
      args: [binary],
      env: commandEnv(options),
      stdout: "null",
      stderr: "null",
    }).output();
    return out.success;
  } catch {
    return false;
  }
}

async function powerShellOptional(script: string, options: RuntimeOptions): Promise<string | null> {
  for (const binary of ["powershell", "pwsh"]) {
    try {
      const out = await new Deno.Command(binary, {
        args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
        env: commandEnv(options),
        stdout: "piped",
        stderr: "null",
      }).output();
      if (out.success) return new TextDecoder().decode(out.stdout);
    } catch {
      // try next candidate
    }
  }
  return null;
}

function escapePowerShellSingleQuoted(value: string): string {
  return value.replaceAll("'", "''");
}

function windowsWeekday(day: string): string {
  const normalized = day.toLowerCase();
  const map: Record<string, string> = {
    sunday: "SUN",
    monday: "MON",
    tuesday: "TUE",
    wednesday: "WED",
    thursday: "THU",
    friday: "FRI",
    saturday: "SAT",
  };
  return map[normalized] ?? "SUN";
}

function normalizeWindowsTime(value: string): string {
  const [hoursRaw = "00", minutesRaw = "00"] = value.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  const hh = Number.isFinite(hours) ? String(hours).padStart(2, "0") : "00";
  const mm = Number.isFinite(minutes) ? String(minutes).padStart(2, "0") : "00";
  return `${hh}:${mm}`;
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

async function shouldUseRealSystemctl(options: RuntimeOptions): Promise<boolean> {
  if (options.env?.ZEN_BACKUP_FORCE_SIMULATED_SYSTEMD === "1") {
    return false;
  }
  const os = options.os ?? (Deno.build.os as Platform);
  if (os !== "linux") return false;
  const runtimeHome = resolveHome(options);
  const processHome = Deno.env.get("HOME") ?? Deno.env.get("USERPROFILE");
  if (processHome && runtimeHome !== processHome) return false;
  if (!(await commandExists("systemctl", options))) return false;
  const probe = await systemctlOptional(["--user", "show-environment"], options);
  return probe !== null;
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

async function systemctl(args: string[], options: RuntimeOptions): Promise<string> {
  const out = await new Deno.Command("systemctl", {
    args,
    env: commandEnv(options),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!out.success) {
    const stderr = new TextDecoder().decode(out.stderr).trim();
    throw new Error(`systemctl ${args.join(" ")} failed: ${stderr}`);
  }
  return new TextDecoder().decode(out.stdout);
}

async function systemctlOptional(args: string[], options: RuntimeOptions): Promise<string | null> {
  const out = await new Deno.Command("systemctl", {
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

function weekdayAbbrev(day: string): string {
  const normalized = day.toLowerCase();
  const map: Record<string, string> = {
    sunday: "Sun",
    monday: "Mon",
    tuesday: "Tue",
    wednesday: "Wed",
    thursday: "Thu",
    friday: "Fri",
    saturday: "Sat",
  };
  return map[normalized] ?? "Sun";
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

function systemdServiceTemplate(kind: "daily" | "weekly"): string {
  return `[Unit]
Description=Zen Backup (${kind})

[Service]
Type=oneshot
ExecStart=zen-backup backup ${kind}
`;
}

function systemdDailyTimerTemplate(input: { hour: number; minute: number }): string {
  const hour = String(input.hour).padStart(2, "0");
  const minute = String(input.minute).padStart(2, "0");
  return `[Unit]
Description=Zen Backup Daily Timer

[Timer]
OnCalendar=*-*-* ${hour}:${minute}:00
Persistent=true

[Install]
WantedBy=timers.target
`;
}

function systemdWeeklyTimerTemplate(
  input: { hour: number; minute: number; weekday: string },
): string {
  const hour = String(input.hour).padStart(2, "0");
  const minute = String(input.minute).padStart(2, "0");
  return `[Unit]
Description=Zen Backup Weekly Timer

[Timer]
OnCalendar=${input.weekday} *-*-* ${hour}:${minute}:00
Persistent=true

[Install]
WantedBy=timers.target
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
