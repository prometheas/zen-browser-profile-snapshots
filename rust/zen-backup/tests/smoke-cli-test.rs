#[test]
fn prints_version_with_flag() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("--version")
        .output()
        .unwrap();
    assert!(out.status.success());
}
