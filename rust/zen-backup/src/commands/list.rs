use crate::config::{load_config, ConfigError};
use std::fs;
use std::path::Path;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone)]
struct ArchiveEntry {
    name: String,
    size_bytes: u64,
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

            let mut daily = collect_archives(backup_dir.join("daily"), "daily");
            let mut weekly = collect_archives(backup_dir.join("weekly"), "weekly");
            daily.sort_by(|a, b| a.name.cmp(&b.name));
            weekly.sort_by(|a, b| a.name.cmp(&b.name));

            if daily.is_empty() && weekly.is_empty() {
                return CommandOutput {
                    exit_code: 0,
                    stdout: "No backups found (empty backup directory).".to_string(),
                    stderr: String::new(),
                };
            }

            let mut lines = vec!["daily:".to_string()];
            for entry in daily {
                lines.push(format!(
                    "  {} ({})",
                    entry.name,
                    format_size(entry.size_bytes)
                ));
            }
            lines.push("weekly:".to_string());
            for entry in weekly {
                lines.push(format!(
                    "  {} ({})",
                    entry.name,
                    format_size(entry.size_bytes)
                ));
            }

            CommandOutput {
                exit_code: 0,
                stdout: lines.join("\n"),
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

fn collect_archives(dir: impl AsRef<Path>, kind: &str) -> Vec<ArchiveEntry> {
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
        let size_bytes = path.metadata().map(|v| v.len()).unwrap_or(0);
        items.push(ArchiveEntry { name, size_bytes });
    }
    items
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
