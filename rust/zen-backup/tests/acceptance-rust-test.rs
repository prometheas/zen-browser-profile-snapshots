use cucumber::{gherkin::Step, given, then, when, World as _};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
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

#[given("the backup directory exists but contains no archives")]
async fn backup_directory_empty(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("backups");
    fs::create_dir_all(backup_dir.join("daily")).expect("failed to create daily dir");
    fs::create_dir_all(backup_dir.join("weekly")).expect("failed to create weekly dir");
    write_settings(&workspace, &backup_dir);
}

#[given("the backup directory does not exist")]
async fn backup_directory_missing(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("missing-backups");
    write_settings(&workspace, &backup_dir);
}

#[given("the backup directory contains:")]
async fn backup_directory_contains(world: &mut AcceptanceWorld, step: &Step) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("backups");
    fs::create_dir_all(&backup_dir).expect("failed to create backup root");
    write_settings(&workspace, &backup_dir);

    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let subdirectory_index = *headers
        .get("subdirectory")
        .expect("missing subdirectory column");
    let file_index = *headers.get("file").expect("missing file column");
    let size_index = headers.get("size").copied();

    for row in table.rows.iter().skip(1) {
        let subdirectory = row[subdirectory_index].trim();
        let file = row[file_index].trim();
        if file.is_empty() {
            continue;
        }
        let path = backup_dir.join(subdirectory).join(file);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create archive parent");
        }
        let size = size_index
            .and_then(|idx| row.get(idx))
            .map(|value| parse_size_to_bytes(value))
            .unwrap_or(256);
        fs::write(path, vec![0_u8; size]).expect("failed to write archive file");
    }
}

#[when("the status command is run")]
async fn run_status(world: &mut AcceptanceWorld) {
    run_command(world, "status");
}

#[when("the list command is run")]
async fn run_list(world: &mut AcceptanceWorld) {
    run_command(world, "list");
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

#[then(expr = "stdout contains {string} or {string}")]
async fn stdout_contains_either(world: &mut AcceptanceWorld, left: String, right: String) {
    assert!(
        world.stdout.contains(&left) || world.stdout.contains(&right),
        "expected stdout to contain `{left}` or `{right}`, got `{}`",
        world.stdout
    );
}

#[then(expr = "stderr contains {string} or {string}")]
async fn stderr_contains_either(world: &mut AcceptanceWorld, left: String, right: String) {
    assert!(
        world.stderr.contains(&left) || world.stderr.contains(&right),
        "expected stderr to contain `{left}` or `{right}`, got `{}`",
        world.stderr
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

#[then("the exit code is non-zero")]
async fn exit_code_non_zero(world: &mut AcceptanceWorld) {
    assert_ne!(world.exit_code, 0, "expected non-zero exit code");
}

#[tokio::main]
async fn main() {
    let list_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/list.feature");
    AcceptanceWorld::filter_run(list_feature, |feature, _, scenario| {
        feature.name == "List Snapshots"
            && matches!(
                scenario.name.as_str(),
                "List shows daily and weekly archives"
                    | "List handles empty backup directory"
                    | "List handles missing backup directory"
            )
    })
    .await;

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

fn ensure_workspace(world: &mut AcceptanceWorld) -> PathBuf {
    if world.workspace.is_none() {
        world.workspace = Some(tempfile::tempdir().expect("failed to create temp workspace"));
    }
    world
        .workspace
        .as_ref()
        .expect("workspace missing")
        .path()
        .to_path_buf()
}

fn write_settings(workspace: &Path, backup_dir: &Path) {
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");

    let config_dir = workspace.join(".config/zen-profile-backup");
    fs::create_dir_all(&config_dir).expect("failed to create config dir");
    let config_body = format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n",
        profile_dir.display(),
        backup_dir.display(),
    );
    fs::write(config_dir.join("settings.toml"), config_body).expect("failed to write settings");
}

fn run_command(world: &mut AcceptanceWorld, command: &str) {
    let workspace = world.workspace.as_ref().expect("workspace not initialized");
    let output = Command::new(resolve_cli_path())
        .arg(command)
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

fn header_map(header: &[String]) -> HashMap<String, usize> {
    header
        .iter()
        .enumerate()
        .map(|(index, value)| (value.trim().to_string(), index))
        .collect()
}

fn parse_size_to_bytes(value: &str) -> usize {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return 256;
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.len() != 2 {
        return 256;
    }
    let number = parts[0].parse::<f64>().unwrap_or(0.25);
    let unit = parts[1].to_ascii_uppercase();
    if unit == "MB" {
        return (number * 1024.0 * 1024.0) as usize;
    }
    if unit == "KB" {
        return (number * 1024.0) as usize;
    }
    if unit == "B" {
        return number as usize;
    }
    256
}
