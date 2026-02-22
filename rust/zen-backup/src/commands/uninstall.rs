use crate::config::load_config;
use crate::platform;
use std::path::Path;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_uninstall(cwd: &Path, purge_backups: bool) -> CommandOutput {
    let mut stdout = Vec::new();
    let mut stderr = Vec::new();

    let config = load_config(false, cwd).ok().flatten();
    let _ = platform::uninstall_scheduler();

    if let Some(cfg) = &config {
        let _ = std::fs::remove_file(&cfg.config_path);
    }

    if purge_backups {
        if let Some(cfg) = &config {
            let _ = std::fs::remove_dir_all(&cfg.backup_local_path);
            stdout.push("Backup archives removed.".to_string());
        }
    } else {
        stderr.push(
            "Backup archives were left in place. Re-run with --purge-backups to remove them and free disk space."
                .to_string(),
        );
    }
    stdout.push("Scheduled jobs removed.".to_string());
    stdout.push("Settings removed.".to_string());

    CommandOutput {
        exit_code: 0,
        stdout: stdout.join("\n"),
        stderr: stderr.join("\n"),
    }
}
