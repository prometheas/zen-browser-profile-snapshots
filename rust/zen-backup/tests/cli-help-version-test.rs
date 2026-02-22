#[test]
fn renders_preview_beta_with_color() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("--version")
        .env("CLICOLOR_FORCE", "1")
        .env("ZEN_BACKUP_TEST_VERSION", "v1.2.3-beta.1-5-gabc1234")
        .output()
        .unwrap();
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(stdout.contains("1.2.3-"));
    assert!(stdout.contains("\u{1b}[1;33mbeta\u{1b}[0m.1"));
    assert!(stdout.contains("-5-\u{1b}[90mgabc1234\u{1b}[0m"));
}

#[test]
fn renders_schedule_help() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("schedule")
        .arg("--help")
        .output()
        .unwrap();
    assert!(out.status.success());
    let stdout = String::from_utf8(out.stdout).unwrap();
    assert!(stdout.contains("zen-backup schedule"));
    assert!(stdout.contains("resume = start"));
}
