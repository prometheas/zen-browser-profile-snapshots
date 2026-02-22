use crate::config::{load_config, ConfigError};
use std::path::Path;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
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

            CommandOutput {
                exit_code: 0,
                stdout: format!(
                    "Zen Profile Backup Status\nProfile path: {}\nBackup directory: {}\n{}\nRetention: daily {} days, weekly {} days",
                    config.profile_path,
                    config.backup_local_path,
                    cloud,
                    config.retention_daily_days,
                    config.retention_weekly_days
                ),
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
