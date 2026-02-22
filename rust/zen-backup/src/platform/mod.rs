pub mod linux;
pub mod macos;
pub mod windows;

use crate::config::AppConfig;
use std::path::{Path, PathBuf};

pub const DAILY_LABEL: &str = "com.prometheas.zen-backup.daily";
pub const WEEKLY_LABEL: &str = "com.prometheas.zen-backup.weekly";
pub const DAILY_TIMER: &str = "zen-backup-daily.timer";
pub const WEEKLY_TIMER: &str = "zen-backup-weekly.timer";
pub const DAILY_TASK: &str = "ZenBackupDaily";
pub const WEEKLY_TASK: &str = "ZenBackupWeekly";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SchedulerState {
    Active,
    Paused,
    NotInstalled,
}

#[derive(Debug, Clone)]
pub struct SchedulerStatus {
    pub labels: Vec<String>,
    pub states: Vec<(String, SchedulerState)>,
}

pub fn install_scheduler(config: &AppConfig) -> Result<SchedulerStatus, String> {
    match current_os().as_str() {
        "darwin" => macos::install(config),
        "linux" => linux::install(config),
        "windows" => windows::install(config),
        os => Err(format!("unsupported platform: {os}")),
    }
}

pub fn uninstall_scheduler() -> Result<SchedulerStatus, String> {
    match current_os().as_str() {
        "darwin" => macos::uninstall(),
        "linux" => linux::uninstall(),
        "windows" => windows::uninstall(),
        os => Err(format!("unsupported platform: {os}")),
    }
}

pub fn start_scheduler() -> Result<SchedulerStatus, String> {
    match current_os().as_str() {
        "darwin" => macos::start(),
        "linux" => linux::start(),
        "windows" => windows::start(),
        os => Err(format!("unsupported platform: {os}")),
    }
}

pub fn stop_scheduler() -> Result<SchedulerStatus, String> {
    match current_os().as_str() {
        "darwin" => macos::stop(),
        "linux" => linux::stop(),
        "windows" => windows::stop(),
        os => Err(format!("unsupported platform: {os}")),
    }
}

pub fn query_scheduler() -> Result<SchedulerStatus, String> {
    match current_os().as_str() {
        "darwin" => macos::query(),
        "linux" => linux::query(),
        "windows" => windows::query(),
        os => Err(format!("unsupported platform: {os}")),
    }
}

pub fn home_dir() -> PathBuf {
    std::env::var("HOME")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .or_else(|| {
            std::env::var("USERPROFILE")
                .ok()
                .filter(|v| !v.trim().is_empty())
        })
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn app_data_dir() -> PathBuf {
    std::env::var("APPDATA")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| home_dir().join("AppData").join("Roaming"))
}

pub fn write(path: &Path, body: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    std::fs::write(path, body).map_err(|err| err.to_string())
}

pub fn exists(path: &Path) -> bool {
    path.exists()
}

pub fn current_os() -> String {
    std::env::var("ZEN_BACKUP_TEST_OS")
        .ok()
        .filter(|v| !v.trim().is_empty())
        .unwrap_or_else(|| std::env::consts::OS.to_string())
}
