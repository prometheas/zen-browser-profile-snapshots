use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub profile_path: String,
    pub backup_local_path: String,
    pub backup_cloud_path: Option<String>,
    pub retention_daily_days: i64,
    pub retention_weekly_days: i64,
    pub schedule_daily_time: String,
    pub schedule_weekly_day: String,
    pub schedule_weekly_time: String,
    pub notifications_enabled: bool,
    pub config_path: PathBuf,
}

#[derive(Debug)]
pub enum ConfigError {
    NotFound(String),
    Parse(String),
}

#[derive(Debug, Default, Deserialize)]
struct RawConfig {
    profile: Option<RawProfile>,
    backup: Option<RawBackup>,
    retention: Option<RawRetention>,
    schedule: Option<RawSchedule>,
    notifications: Option<RawNotifications>,
}

#[derive(Debug, Default, Deserialize)]
struct RawProfile {
    path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct RawBackup {
    local_path: Option<String>,
    cloud_path: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct RawRetention {
    daily_days: Option<i64>,
    weekly_days: Option<i64>,
}

#[derive(Debug, Default, Deserialize)]
struct RawSchedule {
    daily_time: Option<String>,
    weekly_day: Option<String>,
    weekly_time: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct RawNotifications {
    enabled: Option<bool>,
}

pub fn resolve_config_path(cwd: &Path) -> PathBuf {
    if let Ok(value) = std::env::var("ZEN_BACKUP_CONFIG") {
        if !value.trim().is_empty() {
            return cwd.join(value);
        }
    }
    let home = resolve_home();
    if current_os() == "windows" {
        let app_data = std::env::var("APPDATA")
            .ok()
            .filter(|v| !v.trim().is_empty())
            .unwrap_or_else(|| {
                PathBuf::from(&home)
                    .join("AppData")
                    .join("Roaming")
                    .display()
                    .to_string()
            });
        return PathBuf::from(app_data)
            .join("zen-profile-backup")
            .join("settings.toml");
    }
    PathBuf::from(home)
        .join(".config")
        .join("zen-profile-backup")
        .join("settings.toml")
}

pub fn load_config(required: bool, cwd: &Path) -> Result<Option<AppConfig>, ConfigError> {
    let config_path = resolve_config_path(cwd);
    let raw_text = match std::fs::read_to_string(&config_path) {
        Ok(text) => text,
        Err(_) if required => {
            return Err(ConfigError::NotFound(format!(
                "config file not found: {}",
                config_path.display()
            )))
        }
        Err(_) => return Ok(None),
    };

    let parsed = toml::from_str::<RawConfig>(&raw_text)
        .map_err(|_| ConfigError::Parse("config parse error: invalid TOML".to_string()))?;

    let profile_path = parsed
        .profile
        .and_then(|v| v.path)
        .unwrap_or_else(default_profile_path);
    let backup = parsed.backup.unwrap_or_default();
    let backup_local_path = backup.local_path.unwrap_or_else(default_backup_path);
    let schedule = parsed.schedule.unwrap_or_default();
    let notifications = parsed.notifications.unwrap_or_default();

    Ok(Some(AppConfig {
        profile_path: expand_path(&profile_path, &config_path),
        backup_local_path: expand_path(&backup_local_path, &config_path),
        backup_cloud_path: backup.cloud_path,
        retention_daily_days: parsed
            .retention
            .as_ref()
            .and_then(|v| v.daily_days)
            .unwrap_or(30),
        retention_weekly_days: parsed
            .retention
            .as_ref()
            .and_then(|v| v.weekly_days)
            .unwrap_or(84),
        schedule_daily_time: schedule.daily_time.unwrap_or_else(|| "12:30".to_string()),
        schedule_weekly_day: schedule.weekly_day.unwrap_or_else(|| "Sunday".to_string()),
        schedule_weekly_time: schedule.weekly_time.unwrap_or_else(|| "02:00".to_string()),
        notifications_enabled: notifications.enabled.unwrap_or(true),
        config_path,
    }))
}

fn expand_path(path: &str, config_path: &Path) -> String {
    if let Some(rest) = path.strip_prefix("~/") {
        return PathBuf::from(resolve_home())
            .join(rest)
            .display()
            .to_string();
    }
    let as_path = PathBuf::from(path);
    if as_path.is_relative() {
        return config_path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join(as_path)
            .display()
            .to_string();
    }
    path.to_string()
}

fn resolve_home() -> String {
    std::env::var("HOME")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .unwrap_or_else(|| ".".to_string())
}

fn current_os() -> String {
    if let Ok(test_os) = std::env::var("ZEN_BACKUP_TEST_OS") {
        if !test_os.trim().is_empty() {
            return test_os;
        }
    }
    std::env::consts::OS.to_string()
}

fn default_profile_path() -> String {
    let home = resolve_home();
    match current_os().as_str() {
        "darwin" => PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("zen")
            .join("Profiles")
            .join("default")
            .display()
            .to_string(),
        "linux" => PathBuf::from(home)
            .join(".zen")
            .join("default")
            .display()
            .to_string(),
        "windows" => {
            let app_data = std::env::var("APPDATA")
                .ok()
                .filter(|v| !v.trim().is_empty())
                .unwrap_or_else(|| {
                    PathBuf::from(&home)
                        .join("AppData")
                        .join("Roaming")
                        .display()
                        .to_string()
                });
            PathBuf::from(app_data)
                .join("zen")
                .join("Profiles")
                .join("default")
                .display()
                .to_string()
        }
        _ => PathBuf::from(home).join(".zen").display().to_string(),
    }
}

fn default_backup_path() -> String {
    PathBuf::from(resolve_home())
        .join("zen-backups")
        .display()
        .to_string()
}
