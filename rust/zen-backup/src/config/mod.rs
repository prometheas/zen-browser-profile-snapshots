use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct AppConfig {
    pub profile_path: String,
    pub backup_local_path: String,
    pub backup_cloud_path: Option<String>,
    pub retention_daily_days: i64,
    pub retention_weekly_days: i64,
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

pub fn resolve_config_path(cwd: &Path) -> PathBuf {
    if let Ok(value) = std::env::var("ZEN_BACKUP_CONFIG") {
        if !value.trim().is_empty() {
            return cwd.join(value);
        }
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "~".to_string());
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
        .unwrap_or_else(|| "~/.zen".to_string());
    let backup = parsed.backup.unwrap_or_default();
    let backup_local_path = backup
        .local_path
        .unwrap_or_else(|| "~/zen-backups".to_string());

    Ok(Some(AppConfig {
        profile_path,
        backup_local_path,
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
    }))
}
