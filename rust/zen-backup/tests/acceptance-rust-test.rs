use cucumber::{given, then, when, World as _};
use std::path::PathBuf;
use std::process::Command;
use tempfile::TempDir;

#[derive(Debug, Default, cucumber::World)]
struct AcceptanceWorld {
    workspace: Option<TempDir>,
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[given("no settings.toml file exists")]
async fn no_settings_file(world: &mut AcceptanceWorld) {
    world.workspace = Some(tempfile::tempdir().expect("failed to create temp workspace"));
}

#[when("the status command is run")]
async fn run_status(world: &mut AcceptanceWorld) {
    let workspace = world.workspace.as_ref().expect("workspace not initialized");
    let output = Command::new(resolve_cli_path())
        .arg("status")
        .current_dir(workspace.path())
        .env("HOME", workspace.path())
        .env("ZEN_BACKUP_TEST_OS", "darwin")
        .output()
        .expect("failed to execute zen-backup");

    world.exit_code = output.status.code().unwrap_or(1);
    world.stdout = String::from_utf8_lossy(&output.stdout)
        .trim_end()
        .to_string();
    world.stderr = String::from_utf8_lossy(&output.stderr)
        .trim_end()
        .to_string();
}

#[then(expr = "stdout contains {string}")]
async fn stdout_contains(world: &mut AcceptanceWorld, needle: String) {
    assert!(
        world.stdout.contains(&needle),
        "expected stdout to contain `{needle}`, got `{}`",
        world.stdout
    );
}

#[then(expr = "stdout suggests running {string}")]
async fn stdout_suggests(world: &mut AcceptanceWorld, expected: String) {
    assert!(
        world.stdout.contains(&expected),
        "expected stdout to suggest `{expected}`, got `{}`",
        world.stdout
    );
}

#[then(expr = "the exit code is {int}")]
async fn exit_code_is(world: &mut AcceptanceWorld, expected: i32) {
    assert_eq!(
        world.exit_code, expected,
        "expected exit code {expected}, got {} with stderr `{}`",
        world.exit_code, world.stderr
    );
}

#[tokio::main]
async fn main() {
    let status_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/status.feature");
    AcceptanceWorld::filter_run(status_feature, |feature, _, scenario| {
        feature.name == "Status"
            && scenario.name == "Status shows \"Not installed\" when settings.toml is missing"
    })
    .await;
}

fn resolve_cli_path() -> PathBuf {
    if let Ok(path) = std::env::var("ZEN_BACKUP_RUST_CLI_BIN") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }
    if let Ok(path) = std::env::var("CARGO_BIN_EXE_zen-backup") {
        if !path.trim().is_empty() {
            return PathBuf::from(path);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../target/debug/zen-backup")
}
