use std::sync::{Mutex, OnceLock};
use zen_backup::cli::global_options::parse_global_options;
use zen_backup::commands::feedback::run_feedback;

fn env_lock() -> &'static Mutex<()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
}

#[test]
fn parse_global_options_supports_debug_and_log_file() {
    let parsed = parse_global_options(vec![
        "--debug".to_string(),
        "--log-file".to_string(),
        "trace.log".to_string(),
        "status".to_string(),
    ]);
    assert!(parsed.debug_enabled);
    assert_eq!(parsed.log_file_path.as_deref(), Some("trace.log"));
    assert_eq!(parsed.command_args, vec!["status"]);
}

#[test]
fn feedback_bug_uses_gh_when_available() {
    let _guard = env_lock().lock().unwrap();
    std::env::set_var("ZEN_BACKUP_TEST_GH_AVAILABLE", "1");
    std::env::set_var(
        "ZEN_BACKUP_TEST_FEEDBACK_ANSWERS",
        r#"{"title":"Bug title","description":"Desc","steps_to_reproduce":"Step","expected_behavior":"Expected"}"#,
    );
    let out = run_feedback("bug");
    assert_eq!(out.exit_code, 0);
    assert!(out.stdout.contains("Created issue:"));
    std::env::remove_var("ZEN_BACKUP_TEST_GH_AVAILABLE");
    std::env::remove_var("ZEN_BACKUP_TEST_FEEDBACK_ANSWERS");
}

#[test]
fn feedback_request_falls_back_to_browser() {
    let _guard = env_lock().lock().unwrap();
    std::env::set_var("ZEN_BACKUP_TEST_GH_AVAILABLE", "0");
    std::env::set_var("ZEN_BACKUP_TEST_BROWSER_OPEN", "1");
    std::env::set_var(
        "ZEN_BACKUP_TEST_FEEDBACK_ANSWERS",
        r#"{"title":"Feature","problem":"Problem","solution":"Solution","platforms":"all"}"#,
    );
    let out = run_feedback("request");
    assert_eq!(out.exit_code, 0);
    assert!(out.stdout.contains("Opened feedback URL:"));
    std::env::remove_var("ZEN_BACKUP_TEST_GH_AVAILABLE");
    std::env::remove_var("ZEN_BACKUP_TEST_BROWSER_OPEN");
    std::env::remove_var("ZEN_BACKUP_TEST_FEEDBACK_ANSWERS");
}
