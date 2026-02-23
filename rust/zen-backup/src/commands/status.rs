use crate::config::{load_config, ConfigError};
use crate::platform::{query_scheduler, SchedulerState};
use chrono::{DateTime, NaiveDate, Utc};
use std::fs;
use std::io;
use std::path::Path;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone)]
struct ArchiveEntry {
    kind: &'static str,
    name: String,
    size_bytes: u64,
}

pub fn run_status(cwd: &Path) -> CommandOutput {
    match load_config(false, cwd) {
        Ok(None) => CommandOutput {
            exit_code: 0,
            stdout: "Not installed\nRun \"zen-backup install\" to configure backups.".to_string(),
            stderr: String::new(),
        },
        Ok(Some(config)) => {
            let cloud = config
                .backup_cloud_path
                .as_ref()
                .map(|v| format!("Cloud sync: enabled ({v})"))
                .unwrap_or_else(|| "Cloud sync: local only".to_string());

            let mut lines = vec![
                "Zen Profile Backup Status".to_string(),
                format!("Profile path: {}", config.profile_path),
                format!("Backup directory: {}", config.backup_local_path),
                cloud,
                format!(
                    "Retention: daily {} days, weekly {} days",
                    config.retention_daily_days, config.retention_weekly_days
                ),
            ];

            let backup_dir = Path::new(&config.backup_local_path);
            if !backup_dir.exists() {
                lines.push(
                    "Backup directory not found. Run a backup or check configuration.".to_string(),
                );
                return CommandOutput {
                    exit_code: 0,
                    stdout: lines.join("\n"),
                    stderr: String::new(),
                };
            }

            if !is_readable_directory(backup_dir) {
                lines.push("Backup directory permission error.".to_string());
                return CommandOutput {
                    exit_code: 1,
                    stdout: lines.join("\n"),
                    stderr: "Backup directory is not readable.".to_string(),
                };
            }

            let mut archives = collect_archives(backup_dir);
            archives.sort_by(|a, b| a.name.cmp(&b.name));

            let latest_daily = newest_archive(&archives, "daily");
            let latest_weekly = newest_archive(&archives, "weekly");

            lines.push(
                latest_daily
                    .as_ref()
                    .map(|entry| {
                        format!(
                            "Latest daily: {} ({})",
                            entry.name,
                            format_size(entry.size_bytes)
                        )
                    })
                    .unwrap_or_else(|| "No daily backups yet".to_string()),
            );
            lines.push(
                latest_weekly
                    .as_ref()
                    .map(|entry| {
                        format!(
                            "Latest weekly: {} ({})",
                            entry.name,
                            format_size(entry.size_bytes)
                        )
                    })
                    .unwrap_or_else(|| "No weekly backups yet".to_string()),
            );

            let daily_size = directory_size(&backup_dir.join("daily"));
            let weekly_size = directory_size(&backup_dir.join("weekly"));
            let total_size = daily_size + weekly_size;
            lines.push(format!("Disk usage total: {}", format_size(total_size)));
            lines.push(format!("Disk usage daily: {}", format_size(daily_size)));
            lines.push(format!("Disk usage weekly: {}", format_size(weekly_size)));

            if let Some(message) = latest_daily
                .as_ref()
                .and_then(|entry| daily_staleness_message(&entry.name, now_utc()))
            {
                lines.push(message);
            } else {
                lines.push("No backups yet. Run a backup.".to_string());
            }

            match query_scheduler() {
                Ok(scheduler) => {
                    if scheduler.labels.is_empty() {
                        lines.push("Scheduled jobs: not installed (not loaded)".to_string());
                    } else {
                        let all_active = scheduler
                            .states
                            .iter()
                            .all(|(_, state)| *state == SchedulerState::Active);
                        lines.push(if all_active {
                            "Scheduled jobs: active".to_string()
                        } else {
                            "Scheduled jobs: paused".to_string()
                        });
                        for label in scheduler.labels {
                            lines.push(format!("- {label}"));
                        }
                    }
                }
                Err(err) => {
                    return CommandOutput {
                        exit_code: 1,
                        stdout: lines.join("\n"),
                        stderr: err,
                    }
                }
            }

            CommandOutput {
                exit_code: 0,
                stdout: lines.join("\n"),
                stderr: String::new(),
            }
        }
        Err(ConfigError::Parse(message)) | Err(ConfigError::NotFound(message)) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: message,
        },
    }
}

fn collect_archives(root: &Path) -> Vec<ArchiveEntry> {
    let mut items = Vec::new();
    items.extend(collect_kind(root.join("daily"), "daily"));
    items.extend(collect_kind(root.join("weekly"), "weekly"));
    items
}

fn collect_kind(dir: impl AsRef<Path>, kind: &'static str) -> Vec<ArchiveEntry> {
    let mut items = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return items,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = match path.file_name().and_then(|v| v.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        if !name.starts_with(&format!("zen-backup-{kind}-")) || !name.ends_with(".tar.gz") {
            continue;
        }
        let size_bytes = path.metadata().map(|meta| meta.len()).unwrap_or(0);
        items.push(ArchiveEntry {
            kind,
            name,
            size_bytes,
        });
    }
    items
}

fn newest_archive(entries: &[ArchiveEntry], kind: &str) -> Option<ArchiveEntry> {
    entries
        .iter()
        .filter(|entry| entry.kind == kind)
        .max_by(|a, b| a.name.cmp(&b.name))
        .cloned()
}

fn directory_size(path: &Path) -> u64 {
    let mut total = 0;
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(_) => return total,
    };
    for entry in entries.flatten() {
        let child = entry.path();
        if child.is_file() {
            total += child.metadata().map(|meta| meta.len()).unwrap_or(0);
        } else if child.is_dir() {
            total += directory_size(&child);
        }
    }
    total
}

fn format_size(bytes: u64) -> String {
    if bytes < 1024 {
        return format!("{bytes} B");
    }
    let units = ["KB", "MB", "GB", "TB"];
    let mut value = bytes as f64 / 1024.0;
    let mut unit_index = 0;
    while value >= 1024.0 && unit_index < units.len() - 1 {
        value /= 1024.0;
        unit_index += 1;
    }
    format!("{value:.1} {}", units[unit_index])
}

fn archive_date(name: &str) -> Option<NaiveDate> {
    let prefix = "zen-backup-";
    if !name.starts_with(prefix) || !name.ends_with(".tar.gz") {
        return None;
    }
    let parts: Vec<&str> = name.split('-').collect();
    if parts.len() < 6 {
        return None;
    }
    let year = parts.get(3)?;
    let month = parts.get(4)?;
    let day = parts.get(5)?.split('.').next()?;
    NaiveDate::parse_from_str(&format!("{year}-{month}-{day}"), "%Y-%m-%d").ok()
}

fn daily_staleness_message(archive_name: &str, now: DateTime<Utc>) -> Option<String> {
    let date = archive_date(archive_name)?;
    let now_date = now.date_naive();
    let age_days = (now_date - date).num_days();
    if age_days > 3 {
        return Some("Warning: latest daily backup is stale.".to_string());
    }
    Some("Health: recent daily backup exists.".to_string())
}

fn now_utc() -> DateTime<Utc> {
    if let Ok(raw) = std::env::var("ZEN_BACKUP_TEST_NOW") {
        if let Ok(value) = DateTime::parse_from_rfc3339(&raw) {
            return value.with_timezone(&Utc);
        }
    }
    Utc::now()
}

fn is_readable_directory(path: &Path) -> bool {
    if std::env::var("ZEN_BACKUP_TEST_STATUS_PERMISSION_DENIED")
        .ok()
        .as_deref()
        == Some("1")
    {
        return false;
    }
    match fs::read_dir(path) {
        Ok(_) => true,
        Err(err) => err.kind() != io::ErrorKind::PermissionDenied,
    }
}
