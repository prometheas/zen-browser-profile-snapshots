use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;

pub struct DebugLogger {
    enabled: bool,
    log_file_path: Option<PathBuf>,
}

impl DebugLogger {
    pub fn new(enabled: bool, log_file_path: Option<String>) -> Self {
        Self {
            enabled,
            log_file_path: log_file_path.map(PathBuf::from),
        }
    }

    pub fn debug(&self, message: &str) {
        if !self.enabled {
            return;
        }
        let line = format!("[DEBUG] {} {}", iso_timestamp(), message);
        eprintln!("{line}");
        if let Some(path) = &self.log_file_path {
            if let Some(parent) = path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
                let _ = writeln!(file, "{line}");
            }
        }
    }
}

fn iso_timestamp() -> String {
    std::process::Command::new("date")
        .arg("-u")
        .arg("+%Y-%m-%dT%H:%M:%SZ")
        .output()
        .ok()
        .and_then(|v| String::from_utf8(v.stdout).ok())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| "1970-01-01T00:00:00Z".to_string())
}
