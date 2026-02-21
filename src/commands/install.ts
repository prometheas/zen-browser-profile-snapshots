import { dirname, join } from "jsr:@std/path@1.1.4";
import { loadConfig } from "../config.ts";
import { installScheduler } from "../platform/scheduler.ts";
import type { AppConfig, Platform, RuntimeOptions } from "../types.ts";

export async function runInstall(options: RuntimeOptions = {}): Promise<{
  exitCode: number;
  stdout: string[];
  stderr: string[];
}> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const runtimeEnv = options.env ?? Deno.env.toObject();
    const os = options.os ?? (Deno.build.os as Platform);
    const home = runtimeEnv.HOME ?? runtimeEnv.USERPROFILE ?? Deno.cwd();
    const configPath = resolveConfigPathForInstall(os, home, runtimeEnv);
    await Deno.mkdir(dirname(configPath), { recursive: true });

    if (options.env?.ZEN_BACKUP_SIMULATE_CONFIG_PERMISSION_DENIED === "1") {
      throw new Error("Permission denied writing config directory");
    }

    const profilePath = await detectProfilePath({ ...options, env: runtimeEnv });
    if (profilePath) {
      stdout.push(`Detected profile path: ${profilePath}`);
      stdout.push("User input for profile path not required.");
    } else {
      stdout.push("No Zen profile detected.");
      stdout.push("Please enter profile path.");
      stdout.push("Custom path is accepted.");
    }

    const backupDefault = defaultBackupPath(os, home, runtimeEnv);
    stdout.push(`Default backup directory: ${backupDefault}`);
    stdout.push("Cloud options: Google Drive, iCloud Drive, OneDrive, Dropbox, Custom path, None (local only)");

    const cloudPath = await detectCloudPath({ ...options, env: runtimeEnv }, os);
    const configText = toToml({
      profile: { path: profilePath ?? join(home, "zen-profile") },
      backup: { local_path: backupDefault, cloud_path: cloudPath },
      retention: { daily_days: 30, weekly_days: 84 },
      schedule: { daily_time: "12:30", weekly_day: "Sunday", weekly_time: "02:00" },
      notifications: { enabled: true },
      _meta: { config_path: configPath },
    });
    await Deno.writeTextFile(configPath, configText);

    const config = await loadConfig({ ...options, env: runtimeEnv, required: true });
    if (!config) throw new Error("failed to load written config");
    const scheduler = await installScheduler(config, options);
    if (scheduler.installed) {
      stdout.push("Scheduler installed.");
      stdout.push(...scheduler.labels);
    }

    if (os === "darwin") {
      const hasTerminalNotifier = await executableExists("terminal-notifier", runtimeEnv);
      if (!hasTerminalNotifier) {
        stderr.push(
          "Optional: install `terminal-notifier` for improved native notifications (fallback to osascript is used).",
        );
      }
    }
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    stderr.push(error instanceof Error ? error.message : String(error));
    return { exitCode: 1, stdout, stderr };
  }
}

async function executableExists(
  name: string,
  env?: Record<string, string | undefined>,
): Promise<boolean> {
  if (env?.ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER === "1" && name === "terminal-notifier") {
    return false;
  }
  const probe = await new Deno.Command("sh", {
    args: ["-lc", `command -v ${name}`],
    env: env ? Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined)) as Record<string, string> : undefined,
    stdout: "null",
    stderr: "null",
  }).output();
  return probe.success;
}

async function detectProfilePath(options: RuntimeOptions): Promise<string | null> {
  const override = options.env?.ZEN_BACKUP_PROFILE_PATH;
  if (override && override.trim().length > 0) {
    if (options.env?.ZEN_BACKUP_VALIDATE_ONLY === "1") {
      if (!(await exists(override))) {
        throw new Error("Profile path does not exist. Please enter a valid path.");
      }
    }
    return override;
  }

  const os = options.os ?? (Deno.build.os as Platform);
  const home = options.env?.HOME ?? options.env?.USERPROFILE ?? Deno.cwd();
  const candidates: string[] = [];
  if (os === "darwin") {
    candidates.push(join(home, "Library", "Application Support", "zen", "Profiles", "default"));
  } else if (os === "linux") {
    candidates.push(join(home, ".zen", "default"), join(home, ".config", "zen", "default"));
  } else if (os === "windows") {
    const appData = options.env?.APPDATA ?? join(home, "AppData", "Roaming");
    candidates.push(join(appData, "zen", "Profiles", "default"));
  }
  for (const path of candidates) {
    try {
      await Deno.stat(path);
      return path;
    } catch {
      // keep searching
    }
  }
  return null;
}

async function detectCloudPath(options: RuntimeOptions, os: Platform): Promise<string | undefined> {
  if (options.env?.ZEN_BACKUP_CLOUD === "none") {
    return undefined;
  }
  if (options.env?.ZEN_BACKUP_CLOUD_CUSTOM) {
    return options.env.ZEN_BACKUP_CLOUD_CUSTOM;
  }
  const home = options.env?.HOME ?? options.env?.USERPROFILE ?? Deno.cwd();
  const appData = options.env?.APPDATA ?? join(home, "AppData", "Roaming");
  const candidates = os === "darwin"
    ? [
      { label: "Google Drive", path: join(home, "Library", "CloudStorage", "GoogleDrive-user@gmail.com", "My Drive") },
      { label: "iCloud Drive", path: join(home, "Library", "Mobile Documents", "com~apple~CloudDocs") },
      { label: "OneDrive", path: join(home, "Library", "CloudStorage", "OneDrive-Personal") },
      { label: "Dropbox", path: join(home, "Dropbox") },
    ]
    : os === "linux"
    ? [
      { label: "Google Drive", path: join(home, "google-drive") },
      { label: "Dropbox", path: join(home, "Dropbox") },
    ]
    : [
      { label: "Google Drive", path: join(home, "Google Drive", "My Drive") },
      { label: "OneDrive", path: join(home, "OneDrive") },
      { label: "Dropbox", path: join(home, "Dropbox") },
      { label: "Google Drive", path: join(appData, "Google Drive", "My Drive") },
    ];
  for (const provider of candidates) {
    if (await exists(provider.path)) return provider.path;
  }
  return undefined;
}

function toToml(config: AppConfig): string {
  const cloudLine = config.backup.cloud_path ? `cloud_path = "${config.backup.cloud_path}"\n` : "";
  return `[profile]
path = "${config.profile.path}"

[backup]
local_path = "${config.backup.local_path}"
${cloudLine}
[retention]
daily_days = ${config.retention.daily_days}
weekly_days = ${config.retention.weekly_days}

[schedule]
daily_time = "${config.schedule.daily_time}"
weekly_day = "${config.schedule.weekly_day}"
weekly_time = "${config.schedule.weekly_time}"

[notifications]
enabled = ${config.notifications.enabled}
`;
}

function defaultBackupPath(
  os: Platform,
  home: string,
  env: Record<string, string | undefined> | undefined,
): string {
  if (os === "windows") {
    const user = env?.USERPROFILE ?? home;
    return join(user, "zen-backups");
  }
  return join(home, "zen-backups");
}

function resolveConfigPathForInstall(
  os: Platform,
  home: string,
  env: Record<string, string | undefined> | undefined,
): string {
  if (os === "windows") {
    const appData = env?.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "zen-profile-backup", "settings.toml");
  }
  return join(home, ".config", "zen-profile-backup", "settings.toml");
}

async function exists(path: string): Promise<boolean> {
  try {
    await Deno.stat(path);
    return true;
  } catch {
    return false;
  }
}
