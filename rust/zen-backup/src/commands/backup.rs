use crate::config::{load_config, ConfigError};
use crate::core::archive_naming::build_archive_name;
use chrono::{DateTime, SecondsFormat, Utc};
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_backup(kind: &str, cwd: &Path) -> CommandOutput {
    if kind != "daily" && kind != "weekly" {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "backup kind must be daily or weekly".to_string(),
        };
    }

    let config = match load_config(true, cwd) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: "config file not found".to_string(),
            }
        }
        Err(ConfigError::Parse(message)) | Err(ConfigError::NotFound(message)) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: message,
            }
        }
    };

    let profile_path = PathBuf::from(&config.profile_path);
    if !profile_path.exists() {
        let _ = emit_notification(
            &local_notification_root(&config.backup_local_path),
            config.notifications_enabled,
            "Zen Backup Error",
            &format!("profile path not found: {}", config.profile_path),
        );
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!("profile path not found: {}", config.profile_path),
        };
    }

    let local_root = PathBuf::from(&config.backup_local_path);
    let kind_dir = local_root.join(kind);
    if let Err(err) = fs::create_dir_all(&kind_dir) {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!("failed to create backup directory: {err}"),
        };
    }

    if std::env::var("ZEN_BACKUP_BROWSER_RUNNING").ok().as_deref() == Some("1") {
        let message =
            "browser is running; SQLite databases are safely backed up, but session files may be mid-write";
        let _ = append_log(&local_root, "WARNING", message);
        let _ = emit_notification(
            &local_root,
            config.notifications_enabled,
            "Zen Backup",
            message,
        );
    }

    let now = now_iso_date();
    let archive_path = next_archive_path(&kind_dir, kind, &now);
    let (archive_ok, warnings) = create_profile_archive(&profile_path, &archive_path);
    if !archive_ok {
        let _ = fs::remove_file(&archive_path);
        let message = "archive creation failed";
        let _ = append_log(&local_root, "ERROR", message);
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: message.to_string(),
        };
    }

    for warning in warnings {
        let _ = append_log(&local_root, "WARNING", &warning);
    }

    let retention_days = if kind == "daily" {
        config.retention_daily_days
    } else {
        config.retention_weekly_days
    };
    prune_archives(&local_root, kind, retention_days, &now);

    let mut stderr = String::new();
    let mut exit_code = 0;
    if let Some(cloud_path) = &config.backup_cloud_path {
        let cloud_root = PathBuf::from(cloud_path);
        let cloud_kind_dir = cloud_root.join(kind);
        if fs::create_dir_all(&cloud_kind_dir).is_ok() {
            let cloud_archive_path = cloud_kind_dir.join(
                archive_path
                    .file_name()
                    .unwrap_or_else(|| OsStr::new("archive.tar.gz")),
            );
            if fs::copy(&archive_path, &cloud_archive_path).is_ok() {
                prune_archives(&cloud_root, kind, retention_days, &now);
            } else {
                exit_code = 1;
                stderr = "cloud sync failed: failed to copy archive".to_string();
                let _ = append_log(&local_root, "ERROR", &stderr);
                let _ = emit_notification(
                    &local_root,
                    config.notifications_enabled,
                    "Zen Backup Warning",
                    &stderr,
                );
            }
        } else {
            exit_code = 1;
            stderr = "cloud sync failed: failed to create cloud backup directory".to_string();
            let _ = append_log(&local_root, "ERROR", &stderr);
            let _ = emit_notification(
                &local_root,
                config.notifications_enabled,
                "Zen Backup Warning",
                &stderr,
            );
        }
    }

    let _ = append_log(
        &local_root,
        "SUCCESS",
        &format!("created {kind} backup {}", archive_path.display()),
    );

    CommandOutput {
        exit_code,
        stdout: format!("Created {kind} backup: {}", archive_path.display()),
        stderr,
    }
}

fn create_profile_archive(profile_path: &Path, archive_path: &Path) -> (bool, Vec<String>) {
    if std::env::var("ZEN_BACKUP_TEST_DISK_FULL").ok().as_deref() == Some("1") {
        let _ = fs::write(archive_path, b"partial-archive");
        return (
            false,
            vec!["disk full while creating archive".to_string()],
        );
    }

    let staging = unique_temp_dir("zen-backup-staging");
    if fs::create_dir_all(&staging).is_err() {
        return (false, vec![]);
    }

    let mut warnings = Vec::new();
    if !copy_allowed_entries(profile_path, profile_path, &staging, &mut warnings) {
        let _ = fs::remove_dir_all(&staging);
        return (false, warnings);
    }

    let status = Command::new("tar")
        .arg("-czf")
        .arg(archive_path)
        .arg("-C")
        .arg(&staging)
        .arg(".")
        .status();
    let _ = fs::remove_dir_all(&staging);
    (status.map(|s| s.success()).unwrap_or(false), warnings)
}

fn copy_allowed_entries(
    current: &Path,
    root: &Path,
    staging_root: &Path,
    warnings: &mut Vec<String>,
) -> bool {
    let entries = match fs::read_dir(current) {
        Ok(v) => v,
        Err(_) => return false,
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let rel = match path.strip_prefix(root) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let rel_norm = rel.to_string_lossy().replace('\\', "/");
        let file_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default();
        let is_dir = path.is_dir();
        if !should_include(&rel_norm, file_name, is_dir) {
            continue;
        }
        let target = staging_root.join(rel);
        if is_dir {
            if fs::create_dir_all(&target).is_err() {
                return false;
            }
            if !copy_allowed_entries(&path, root, staging_root, warnings) {
                return false;
            }
            continue;
        }
        if let Some(parent) = target.parent() {
            if fs::create_dir_all(parent).is_err() {
                return false;
            }
        }

        if is_sqlite_file(file_name) {
            match backup_sqlite_database(&path, &target) {
                Ok(fallback) => {
                    if fallback {
                        warnings.push(format!("fallback sqlite copy used for {rel_norm}"));
                    }
                }
                Err(SqliteBackupError::Corrupt) => {
                    warnings.push(format!("corrupt sqlite skipped: {rel_norm}"));
                    continue;
                }
                Err(SqliteBackupError::Fatal) => return false,
            }
        } else if fs::copy(&path, &target).is_err() {
            return false;
        }
    }
    true
}

fn should_include(rel_path: &str, file_name: &str, is_directory: bool) -> bool {
    const EXCLUDED_FILES: [&str; 5] = [
        "cookies.sqlite",
        "key4.db",
        "logins.json",
        "cert9.db",
        ".parentlock",
    ];
    const EXCLUDED_DIR_PREFIXES: [&str; 7] = [
        "cache2/",
        "crashes/",
        "datareporting/",
        "saved-telemetry-pings/",
        "minidumps/",
        "storage/temporary/",
        "storage/default/chrome/",
    ];

    if EXCLUDED_FILES.contains(&file_name) {
        return false;
    }
    if file_name.ends_with(".sqlite-wal") || file_name.ends_with(".sqlite-shm") {
        return false;
    }
    for prefix in EXCLUDED_DIR_PREFIXES {
        if rel_path == prefix.trim_end_matches('/') || rel_path.starts_with(prefix) {
            return false;
        }
    }
    if rel_path == "storage/default" && is_directory {
        return true;
    }
    if rel_path.starts_with("storage/default/http") {
        return false;
    }
    true
}

fn is_sqlite_file(file_name: &str) -> bool {
    file_name.ends_with(".sqlite") || file_name.ends_with(".db")
}

fn backup_sqlite_database(source: &Path, target: &Path) -> Result<bool, SqliteBackupError> {
    if sqlite_marked_corrupt(source) {
        return Err(SqliteBackupError::Corrupt);
    }

    let force_fallback = std::env::var("ZEN_BACKUP_TEST_FORCE_SQLITE_FALLBACK")
        .ok()
        .map(|value| value == source.to_string_lossy() || value == sqlite_file_name(source))
        .unwrap_or(false);
    let backup_cmd = if force_fallback {
        None
    } else {
        Some(
            Command::new("sqlite3")
                .arg(source)
                .arg(format!(
                    ".backup '{}'",
                    target.to_string_lossy().replace('\'', "''")
                ))
                .status()
                .map_err(|_| SqliteBackupError::Fatal)?,
        )
    };
    if backup_cmd.map(|status| status.success()).unwrap_or(false) {
        return ensure_integrity(target).map(|_| false);
    }
    // fallback path
    fs::copy(source, target).map_err(|_| SqliteBackupError::Fatal)?;
    let wal_source = PathBuf::from(format!("{}-wal", source.display()));
    let shm_source = PathBuf::from(format!("{}-shm", source.display()));
    let wal_target = PathBuf::from(format!("{}-wal", target.display()));
    let shm_target = PathBuf::from(format!("{}-shm", target.display()));
    if wal_source.exists() {
        let _ = fs::copy(&wal_source, &wal_target);
    }
    if shm_source.exists() {
        let _ = fs::copy(&shm_source, &shm_target);
    }
    let _ = Command::new("sqlite3")
        .arg(target)
        .arg("PRAGMA wal_checkpoint(FULL);")
        .status();
    let _ = fs::remove_file(wal_target);
    let _ = fs::remove_file(shm_target);
    ensure_integrity(target)?;
    Ok(true)
}

fn ensure_integrity(db: &Path) -> Result<(), SqliteBackupError> {
    let output = Command::new("sqlite3")
        .arg(db)
        .arg("PRAGMA integrity_check;")
        .output()
        .map_err(|_| SqliteBackupError::Fatal)?;
    if !output.status.success() {
        return Err(SqliteBackupError::Corrupt);
    }
    let stdout = String::from_utf8_lossy(&output.stdout).to_lowercase();
    if !stdout.contains("ok") {
        return Err(SqliteBackupError::Corrupt);
    }
    Ok(())
}

fn sqlite_marked_corrupt(source: &Path) -> bool {
    let marker = std::env::var("ZEN_BACKUP_TEST_CORRUPT_SQLITE")
        .ok()
        .unwrap_or_default();
    !marker.is_empty() && (marker == source.to_string_lossy() || marker == sqlite_file_name(source))
}

fn sqlite_file_name(source: &Path) -> String {
    source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_string()
}

enum SqliteBackupError {
    Corrupt,
    Fatal,
}

fn append_log(root: &Path, level: &str, message: &str) -> Result<(), ()> {
    fs::create_dir_all(root).map_err(|_| ())?;
    let log_path = root.join("backup.log");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|_| ())?;
    let line = format!("[{}] {}: {}\n", now_iso_timestamp(), level, message);
    file.write_all(line.as_bytes()).map_err(|_| ())
}

fn next_archive_path(kind_dir: &Path, kind: &str, date_part: &str) -> PathBuf {
    let base = kind_dir.join(build_archive_name(kind, date_part));
    if !base.exists() {
        return base;
    }
    let mut suffix = 2;
    loop {
        let candidate = kind_dir.join(format!("zen-backup-{kind}-{date_part}-{suffix}.tar.gz"));
        if !candidate.exists() {
            return candidate;
        }
        suffix += 1;
    }
}

fn prune_archives(root: &Path, kind: &str, retention_days: i64, now_date: &str) {
    let kind_dir = root.join(kind);
    let entries = match fs::read_dir(&kind_dir) {
        Ok(v) => v,
        Err(_) => return,
    };
    let now_days = date_to_days(now_date).unwrap_or(0);
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or_default();
        if !name.ends_with(".tar.gz") {
            continue;
        }
        if let Some(date_part) = parse_archive_date(name) {
            let age = now_days - date_to_days(&date_part).unwrap_or(now_days);
            if age > retention_days {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn parse_archive_date(name: &str) -> Option<String> {
    let parts: Vec<&str> = name.split('-').collect();
    if parts.len() < 6 {
        return None;
    }
    let year = parts.get(3)?;
    let month = parts.get(4)?;
    let day_part = parts.get(5)?;
    let day = day_part.split('.').next()?;
    if year.len() == 4 && month.len() == 2 && day.len() == 2 {
        Some(format!("{year}-{month}-{day}"))
    } else {
        None
    }
}

fn date_to_days(date: &str) -> Option<i64> {
    let mut parts = date.split('-');
    let y: i64 = parts.next()?.parse().ok()?;
    let m: i64 = parts.next()?.parse().ok()?;
    let d: i64 = parts.next()?.parse().ok()?;
    Some(y * 372 + m * 31 + d)
}

fn now_iso_date() -> String {
    if let Ok(v) = std::env::var("ZEN_BACKUP_TEST_NOW") {
        return v.chars().take(10).collect();
    }
    now_utc().format("%Y-%m-%d").to_string()
}

fn now_iso_timestamp() -> String {
    now_utc().to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{nanos}"))
}

fn now_utc() -> DateTime<Utc> {
    if let Ok(raw) = std::env::var("ZEN_BACKUP_TEST_NOW") {
        if let Ok(value) = DateTime::parse_from_rfc3339(&raw) {
            return value.with_timezone(&Utc);
        }
    }
    Utc::now()
}

fn emit_notification(root: &Path, enabled: bool, title: &str, message: &str) -> Result<(), ()> {
    if !enabled {
        return Ok(());
    }
    fs::create_dir_all(root).map_err(|_| ())?;
    let log_path = root.join("notifications.log");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|_| ())?;
    let line = format!("[{}] {}: {}\n", now_iso_timestamp(), title, message);
    file.write_all(line.as_bytes()).map_err(|_| ())
}

fn local_notification_root(path: &str) -> PathBuf {
    PathBuf::from(path)
}
