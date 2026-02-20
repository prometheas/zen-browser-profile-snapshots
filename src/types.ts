export type Platform = "darwin" | "linux" | "windows";

export interface AppConfig {
  profile: {
    path: string;
  };
  backup: {
    local_path: string;
    cloud_path?: string;
  };
  retention: {
    daily_days: number;
    weekly_days: number;
  };
  schedule: {
    daily_time: string;
    weekly_day: string;
    weekly_time: string;
  };
  notifications: {
    enabled: boolean;
  };
  _meta: {
    config_path: string;
  };
}

export interface RuntimeOptions {
  env?: Record<string, string | undefined>;
  os?: Platform;
  cwd?: string;
  now?: Date;
}

export interface CommandResult {
  exitCode: number;
  stdout: string[];
  stderr: string[];
}
