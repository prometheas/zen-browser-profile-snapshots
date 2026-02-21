import { dirname, join, resolve } from "jsr:@std/path@1.1.4";
import { parse as parseToml } from "jsr:@std/toml@1.0.11";
import { CliError } from "./errors.ts";
import { expandPath, resolveHomeDir } from "./core/path-utils.ts";
import type { AppConfig, Platform, RuntimeOptions } from "./types.ts";

export interface ConfigLoadOptions extends RuntimeOptions {
  required?: boolean;
  readTextFile?: (path: string) => Promise<string>;
}

export interface ResolvedConfigPath extends RuntimeOptions {
  env: Record<string, string | undefined>;
  os: Platform;
  cwd: string;
}

export function resolveConfigPath(options: RuntimeOptions = {}): string {
  const env = normalizeEnv(options.env);
  const os = options.os ?? (Deno.build.os as Platform);
  const cwd = options.cwd ?? Deno.cwd();

  const override = env.ZEN_BACKUP_CONFIG;
  if (override && override.trim().length > 0) {
    return resolve(cwd, override);
  }

  if (os === "windows") {
    const appData = env.APPDATA ?? join(resolveHomeDir(env), "AppData", "Roaming");
    return join(appData, "zen-profile-backup", "settings.toml");
  }

  return join(resolveHomeDir(env), ".config", "zen-profile-backup", "settings.toml");
}

export async function loadConfig(options: ConfigLoadOptions = {}): Promise<AppConfig | null> {
  const env = normalizeEnv(options.env);
  const os = options.os ?? (Deno.build.os as Platform);
  const cwd = options.cwd ?? Deno.cwd();
  const configPath = resolveConfigPath({ env, os, cwd });
  const readTextFile = options.readTextFile ?? Deno.readTextFile;
  const required = options.required ?? true;

  let raw: string;
  try {
    raw = await readTextFile(configPath);
  } catch (error) {
    if (required) {
      throw new CliError(`config file not found: ${configPath}`, "ERR_CONFIG_NOT_FOUND", 1);
    }
    if (error instanceof Deno.errors.NotFound) {
      return null;
    }
    throw error;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = parseToml(raw) as Record<string, unknown>;
  } catch {
    throw new CliError("config parse error: invalid TOML", "ERR_CONFIG_PARSE", 1);
  }

  const profileRaw = section(parsed, "profile");
  const backupRaw = section(parsed, "backup");
  const retentionRaw = section(parsed, "retention");
  const scheduleRaw = section(parsed, "schedule");
  const notificationsRaw = section(parsed, "notifications");

  const configDir = dirname(configPath);

  const profilePath = asStringOrDefault(profileRaw.path, "~/.zen", "profile.path");
  const localPath = asStringOrDefault(backupRaw.local_path, "~/zen-backups", "backup.local_path");

  const cloudCandidate = backupRaw.cloud_path;
  const cloudPath = cloudCandidate === undefined ? undefined : asString(cloudCandidate, "backup.cloud_path");

  return {
    profile: {
      path: expandPath(profilePath, env, configDir),
    },
    backup: {
      local_path: expandPath(localPath, env, configDir),
      cloud_path: cloudPath && cloudPath.trim().length > 0 ? expandPath(cloudPath, env, configDir) : undefined,
    },
    retention: {
      daily_days: asNumberOrDefault(retentionRaw.daily_days, 30, "retention.daily_days"),
      weekly_days: asNumberOrDefault(retentionRaw.weekly_days, 84, "retention.weekly_days"),
    },
    schedule: {
      daily_time: asStringOrDefault(scheduleRaw.daily_time, "12:30", "schedule.daily_time"),
      weekly_day: asStringOrDefault(scheduleRaw.weekly_day, "Sunday", "schedule.weekly_day"),
      weekly_time: asStringOrDefault(scheduleRaw.weekly_time, "02:00", "schedule.weekly_time"),
    },
    notifications: {
      enabled: asBooleanOrDefault(notificationsRaw.enabled, true, "notifications.enabled"),
    },
    _meta: {
      config_path: configPath,
    },
  };
}

function normalizeEnv(env?: Record<string, string | undefined>): Record<string, string | undefined> {
  if (env) {
    return { ...env };
  }

  return Deno.env.toObject();
}

function section(root: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = root[key];
  if (!value) return {};
  if (typeof value !== "object") {
    throw new CliError(`${key} section must be a table`, "ERR_CONFIG_SCHEMA", 1);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, key: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliError(`${key} must be a non-empty string`, "ERR_CONFIG_SCHEMA", 1);
  }
  return value;
}

function asStringOrDefault(value: unknown, fallback: string, key: string): string {
  if (value === undefined) return fallback;
  return asString(value, key);
}

function asNumberOrDefault(value: unknown, fallback: number, key: string): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new CliError(`${key} must be a number`, "ERR_CONFIG_SCHEMA", 1);
  }
  return value;
}

function asBooleanOrDefault(value: unknown, fallback: boolean, key: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") {
    throw new CliError(`${key} must be a boolean`, "ERR_CONFIG_SCHEMA", 1);
  }
  return value;
}
