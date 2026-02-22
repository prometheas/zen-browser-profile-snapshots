use crate::config::{load_config, resolve_config_path};
use crate::platform;
use std::path::{Path, PathBuf};

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_install(cwd: &Path) -> CommandOutput {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();

    let config_path = resolve_config_path(cwd);
    if std::env::var("ZEN_BACKUP_SIMULATE_CONFIG_PERMISSION_DENIED").as_deref() == Ok("1") {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "Permission denied writing config directory".to_string(),
        };
    }
    if let Some(parent) = config_path.parent() {
        if let Err(err) = std::fs::create_dir_all(parent) {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: err.to_string(),
            };
        }
    }

    let os = platform::current_os();
    let home = platform::home_dir();
    let profile_path = detect_profile_path(&os, &home);
    match &profile_path {
        Some(path) => {
            stdout.push(format!("Detected profile path: {}", path.display()));
            stdout.push("User input for profile path not required.".to_string());
        }
        None => {
            stdout.push("No Zen profile detected.".to_string());
            stdout.push("Please enter profile path.".to_string());
            stdout.push("Custom path is accepted.".to_string());
        }
    }

    let backup_default = home.join("zen-backups");
    stdout.push(format!(
        "Default backup directory: {}",
        backup_default.display()
    ));
    stdout.push(
        "Cloud options: Google Drive, iCloud Drive, OneDrive, Dropbox, Custom path, None (local only)"
            .to_string(),
    );

    let cloud_path = detect_cloud_path(&os, &home);
    let profile_value = profile_path
        .clone()
        .unwrap_or_else(|| home.join("zen-profile"));
    let config_body = to_toml(
        profile_value.display().to_string(),
        backup_default.display().to_string(),
        cloud_path.clone().map(|v| v.display().to_string()),
        config_path.display().to_string(),
    );
    if let Err(err) = std::fs::write(&config_path, config_body) {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: err.to_string(),
        };
    }

    let config = match load_config(true, cwd) {
        Ok(Some(v)) => v,
        Ok(None) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: "failed to load written config".to_string(),
            }
        }
        Err(err) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: format!("{err:?}"),
            }
        }
    };

    match platform::install_scheduler(&config) {
        Ok(status) => {
            if !status.labels.is_empty() {
                stdout.push("Scheduler installed.".to_string());
                stdout.extend(status.labels);
            }
        }
        Err(err) => {
            return CommandOutput {
                exit_code: 1,
                stdout: stdout.join("\n"),
                stderr: err,
            }
        }
    }

    if os == "darwin" && !has_terminal_notifier() {
        stderr.push(
            "Optional: install `terminal-notifier` for improved native notifications (fallback to osascript is used)."
                .to_string(),
        );
    }

    CommandOutput {
        exit_code: 0,
        stdout: stdout.join("\n"),
        stderr: stderr.join("\n"),
    }
}

fn detect_profile_path(os: &str, home: &Path) -> Option<PathBuf> {
    if let Ok(override_path) = std::env::var("ZEN_BACKUP_PROFILE_PATH") {
        if !override_path.trim().is_empty() {
            let path = PathBuf::from(&override_path);
            if std::env::var("ZEN_BACKUP_VALIDATE_ONLY").as_deref() == Ok("1") && !path.exists() {
                return None;
            }
            return Some(path);
        }
    }

    let candidates = if os == "darwin" {
        vec![home
            .join("Library")
            .join("Application Support")
            .join("zen")
            .join("Profiles")
            .join("default")]
    } else if os == "linux" {
        vec![
            home.join(".zen").join("default"),
            home.join(".config").join("zen").join("default"),
        ]
    } else if os == "windows" {
        vec![platform::app_data_dir()
            .join("zen")
            .join("Profiles")
            .join("default")]
    } else {
        vec![]
    };
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn detect_cloud_path(os: &str, home: &Path) -> Option<PathBuf> {
    if std::env::var("ZEN_BACKUP_CLOUD").as_deref() == Ok("none") {
        return None;
    }
    if let Ok(custom) = std::env::var("ZEN_BACKUP_CLOUD_CUSTOM") {
        if !custom.trim().is_empty() {
            return Some(PathBuf::from(custom));
        }
    }
    let app_data = platform::app_data_dir();
    let candidates = if os == "darwin" {
        vec![
            home.join("Library")
                .join("CloudStorage")
                .join("GoogleDrive-user@gmail.com")
                .join("My Drive"),
            home.join("Library")
                .join("Mobile Documents")
                .join("com~apple~CloudDocs"),
            home.join("Library")
                .join("CloudStorage")
                .join("OneDrive-Personal"),
            home.join("Dropbox"),
        ]
    } else if os == "linux" {
        vec![home.join("google-drive"), home.join("Dropbox")]
    } else if os == "windows" {
        vec![
            home.join("Google Drive").join("My Drive"),
            home.join("OneDrive"),
            home.join("Dropbox"),
            app_data.join("Google Drive").join("My Drive"),
        ]
    } else {
        vec![]
    };
    candidates.into_iter().find(|candidate| candidate.exists())
}

fn to_toml(
    profile_path: String,
    backup_local: String,
    cloud_path: Option<String>,
    config_path: String,
) -> String {
    let cloud_line = cloud_path
        .map(|v| {
            format!(
                "cloud_path = \"{}\"\n",
                v.replace('\\', "\\\\").replace('"', "\\\"")
            )
        })
        .unwrap_or_default();
    format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n{}\
[retention]\ndaily_days = 30\nweekly_days = 84\n\n[schedule]\ndaily_time = \"12:30\"\nweekly_day = \"Sunday\"\nweekly_time = \"02:00\"\n\n[notifications]\nenabled = true\n\n[_meta]\nconfig_path = \"{}\"\n",
        profile_path.replace('\\', "\\\\").replace('"', "\\\""),
        backup_local.replace('\\', "\\\\").replace('"', "\\\""),
        cloud_line,
        config_path.replace('\\', "\\\\").replace('"', "\\\""),
    )
}

fn has_terminal_notifier() -> bool {
    if std::env::var("ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER").as_deref() == Ok("1") {
        return false;
    }
    std::process::Command::new("sh")
        .arg("-lc")
        .arg("command -v terminal-notifier")
        .status()
        .map(|v| v.success())
        .unwrap_or(false)
}
