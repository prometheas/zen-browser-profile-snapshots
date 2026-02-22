use std::fs;

fn unique_temp_dir(prefix: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let dir = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn status_reports_not_installed_without_config() {
    let workdir = unique_temp_dir("zen-backup-status");
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("status")
        .current_dir(&workdir)
        .env("HOME", &workdir)
        .output()
        .unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(stdout.contains("Not installed"));
}

#[test]
fn list_errors_when_backup_directory_missing() {
    let workdir = unique_temp_dir("zen-backup-list");
    let config_dir = workdir.join("custom");
    fs::create_dir_all(&config_dir).unwrap();
    fs::write(
        config_dir.join("settings.toml"),
        "[profile]\npath = \"./profile\"\n\n[backup]\nlocal_path = \"./missing\"\n",
    )
    .unwrap();

    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("list")
        .current_dir(&workdir)
        .env("ZEN_BACKUP_CONFIG", "custom/settings.toml")
        .output()
        .unwrap();
    assert!(!out.status.success());
    let stderr = String::from_utf8(out.stderr).unwrap();
    assert!(stderr.contains("backup directory not found"));
}
