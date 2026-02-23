use crate::config::{load_config, ConfigError};
use chrono::{DateTime, Utc};
use std::ffi::OsStr;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_restore(archive_arg: &str, cwd: &Path) -> CommandOutput {
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

    if std::env::var("ZEN_BACKUP_BROWSER_RUNNING").ok().as_deref() == Some("1") {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "Zen browser must be closed before restoring".to_string(),
        };
    }

    let archive_path =
        match resolve_archive_path(archive_arg, cwd, Path::new(&config.backup_local_path)) {
            Some(v) => v,
            None => {
                return CommandOutput {
                    exit_code: 1,
                    stdout: String::new(),
                    stderr: format!("archive not found: {archive_arg}"),
                }
            }
        };

    let staging_dir = match extract_archive_safely(&archive_path) {
        Ok(v) => v,
        Err(err) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: err,
            }
        }
    };

    let profile_path = PathBuf::from(&config.profile_path);
    let pre_restore = match rotate_profile_to_prerestore(&profile_path) {
        Ok(v) => v,
        Err(err) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: err,
            }
        }
    };

    if fs::create_dir_all(&profile_path).is_err() {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "failed to create profile directory".to_string(),
        };
    }

    if copy_dir_contents(&staging_dir, &profile_path).is_err() {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "failed to restore archive contents".to_string(),
        };
    }
    let _ = fs::remove_dir_all(&staging_dir);

    if validate_sqlite_files(&profile_path).is_err() {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!(
                "invalid or corrupted archive: {}",
                archive_path
                    .file_name()
                    .unwrap_or_else(|| OsStr::new("archive"))
                    .to_string_lossy()
            ),
        };
    }

    append_restore_log(
        Path::new(&config.backup_local_path),
        &archive_path
            .file_name()
            .unwrap_or_else(|| OsStr::new("archive"))
            .to_string_lossy(),
    );

    CommandOutput {
        exit_code: 0,
        stdout: format!(
            "Restored from archive: {}\nPre-restore backup: {}",
            archive_path.display(),
            pre_restore.display()
        ),
        stderr: String::new(),
    }
}

fn append_restore_log(backup_root: &Path, archive_name: &str) {
    let log_path = backup_root.join("backup.log");
    let _ = fs::create_dir_all(backup_root);
    let mut file = match OpenOptions::new().create(true).append(true).open(log_path) {
        Ok(file) => file,
        Err(_) => return,
    };
    let _ = writeln!(
        file,
        "[{}] RESTORE: restored {}",
        now_iso_utc(),
        archive_name
    );
}

fn now_iso_utc() -> String {
    if let Ok(raw) = std::env::var("ZEN_BACKUP_TEST_NOW") {
        if let Ok(value) = DateTime::parse_from_rfc3339(&raw) {
            return value.with_timezone(&Utc).to_rfc3339();
        }
    }
    Utc::now().to_rfc3339()
}

fn resolve_archive_path(input: &str, cwd: &Path, backup_root: &Path) -> Option<PathBuf> {
    let raw = PathBuf::from(input);
    let candidates = vec![
        if raw.is_absolute() {
            raw.clone()
        } else {
            cwd.join(&raw)
        },
        backup_root.join(input),
        backup_root.join("daily").join(input),
        backup_root.join("weekly").join(input),
    ];
    candidates.into_iter().find(|p| p.exists())
}

fn extract_archive_safely(archive: &Path) -> Result<PathBuf, String> {
    let list = Command::new("tar")
        .arg("-tzf")
        .arg(archive)
        .output()
        .map_err(|_| "invalid or corrupted archive".to_string())?;
    if !list.status.success() {
        return Err(format!(
            "invalid or corrupted archive: {}",
            archive
                .file_name()
                .unwrap_or_else(|| OsStr::new("archive"))
                .to_string_lossy()
        ));
    }
    let listing = String::from_utf8_lossy(&list.stdout);
    for line in listing.lines() {
        let entry = sanitize_tar_entry(line);
        if entry.split('/').any(|s| s == "..") || is_windows_abs(&entry) {
            return Err(format!("invalid archive entry: {line}"));
        }
    }
    let staging = unique_temp_dir("zen-restore-staging");
    let _ = fs::create_dir_all(&staging);
    let extract = Command::new("tar")
        .arg("-xzf")
        .arg(archive)
        .arg("-C")
        .arg(&staging)
        .output()
        .map_err(|_| "invalid or corrupted archive".to_string())?;
    if !extract.status.success() {
        let _ = fs::remove_dir_all(&staging);
        return Err(format!(
            "invalid or corrupted archive: {}",
            archive
                .file_name()
                .unwrap_or_else(|| OsStr::new("archive"))
                .to_string_lossy()
        ));
    }
    Ok(staging)
}

fn sanitize_tar_entry(entry: &str) -> String {
    let mut value = entry.trim().replace('\\', "/");
    while value.starts_with("./") {
        value = value[2..].to_string();
    }
    while value.starts_with('/') {
        value = value[1..].to_string();
    }
    value
}

fn is_windows_abs(path: &str) -> bool {
    path.len() > 3 && path.as_bytes()[1] == b':' && path.as_bytes()[2] == b'/'
}

fn rotate_profile_to_prerestore(profile: &Path) -> Result<PathBuf, String> {
    let date = std::env::var("ZEN_BACKUP_TEST_NOW")
        .ok()
        .map(|v| v.chars().take(10).collect::<String>())
        .unwrap_or_else(|| "1970-01-01".to_string());
    let mut candidate = PathBuf::from(format!("{}.pre-restore-{}", profile.display(), date));
    let mut idx = 2;
    while candidate.exists() {
        candidate = PathBuf::from(format!(
            "{}.pre-restore-{}-{}",
            profile.display(),
            date,
            idx
        ));
        idx += 1;
    }
    if profile.exists() {
        fs::rename(profile, &candidate).map_err(|_| "failed to rotate profile".to_string())?;
    } else {
        fs::create_dir_all(&candidate)
            .map_err(|_| "failed to create pre-restore dir".to_string())?;
    }
    Ok(candidate)
}

fn copy_dir_contents(from: &Path, to: &Path) -> Result<(), String> {
    for entry in fs::read_dir(from).map_err(|_| "failed to read staging dir".to_string())? {
        let entry = entry.map_err(|_| "failed to read staging entry".to_string())?;
        let src = entry.path();
        let dst = to.join(entry.file_name());
        if src.is_dir() {
            fs::create_dir_all(&dst).map_err(|_| "failed to create restore dir".to_string())?;
            copy_dir_contents(&src, &dst)?;
        } else if src.is_file() {
            if let Some(parent) = dst.parent() {
                let _ = fs::create_dir_all(parent);
            }
            fs::copy(&src, &dst).map_err(|_| "failed to copy restore file".to_string())?;
        }
    }
    Ok(())
}

fn validate_sqlite_files(root: &Path) -> Result<(), ()> {
    for file in walk_files(root).map_err(|_| ())? {
        if file.to_string_lossy().ends_with(".sqlite") {
            let out = Command::new("sqlite3")
                .arg(&file)
                .arg("PRAGMA integrity_check;")
                .output()
                .map_err(|_| ())?;
            if !out.status.success() {
                return Err(());
            }
            let stdout = String::from_utf8_lossy(&out.stdout).to_lowercase();
            if !stdout.contains("ok") {
                return Err(());
            }
        }
    }
    Ok(())
}

fn walk_files(root: &Path) -> Result<Vec<PathBuf>, std::io::Error> {
    let mut out = vec![];
    for entry in fs::read_dir(root)? {
        let path = entry?.path();
        if path.is_dir() {
            out.extend(walk_files(&path)?);
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(out)
}

fn unique_temp_dir(prefix: &str) -> PathBuf {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|v| v.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("{prefix}-{nanos}"))
}
