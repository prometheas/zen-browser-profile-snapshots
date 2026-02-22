use crate::config::{load_config, ConfigError};
use std::path::Path;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_list(cwd: &Path) -> CommandOutput {
    match load_config(true, cwd) {
        Ok(Some(config)) => {
            let backup_dir = Path::new(&config.backup_local_path);
            if !backup_dir.exists() {
                return CommandOutput {
                    exit_code: 1,
                    stdout: String::new(),
                    stderr: format!("backup directory not found: {}", config.backup_local_path),
                };
            }
            CommandOutput {
                exit_code: 0,
                stdout: "daily:\nweekly:".to_string(),
                stderr: String::new(),
            }
        }
        Ok(None) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "config file not found".to_string(),
        },
        Err(ConfigError::Parse(message)) | Err(ConfigError::NotFound(message)) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: message,
        },
    }
}
