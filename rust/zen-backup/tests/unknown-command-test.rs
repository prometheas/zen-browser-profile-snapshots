#[test]
fn unknown_command_does_not_delegate_to_typescript_runtime() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("does-not-exist")
        .env("PATH", "")
        .output()
        .expect("failed to run binary");

    assert_eq!(out.status.code(), Some(1));
    let stderr = String::from_utf8_lossy(&out.stderr);
    assert!(stderr.contains("Unknown command: does-not-exist"));
    assert!(!stderr.contains("failed to launch TypeScript fallback runtime"));
}
