use cucumber::{gherkin::Step, given, then, when, World as _};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;
use zen_backup::config::{load_config, AppConfig};

#[derive(Debug, Default, cucumber::World)]
struct AcceptanceWorld {
    workspace: Option<TempDir>,
    env: HashMap<String, String>,
    loaded_config: Option<AppConfig>,
    profile_dir: Option<PathBuf>,
    backup_dir: Option<PathBuf>,
    last_archive: Option<PathBuf>,
    pending_restore_archive: Option<PathBuf>,
    tracked_backup_archives: Vec<PathBuf>,
    stdout: String,
    stderr: String,
    exit_code: i32,
}

#[given("no settings.toml file exists")]
async fn no_settings_file(world: &mut AcceptanceWorld) {
    world.workspace = Some(tempfile::tempdir().expect("failed to create temp workspace"));
    world.env.remove("ZEN_BACKUP_CONFIG");
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

#[given(expr = "the environment variable {string} is set to {string}")]
async fn set_env_var(world: &mut AcceptanceWorld, key: String, value: String) {
    world.env.insert(key, value);
}

#[given(expr = "the environment variable {string} is not set")]
async fn unset_env_var(world: &mut AcceptanceWorld, key: String) {
    world.env.remove(&key);
}

#[given(expr = "a config file exists at {string} containing:")]
async fn config_file_at_path(world: &mut AcceptanceWorld, path: String, step: &Step) {
    let workspace = ensure_workspace(world);
    let file_path = workspace.join(path);
    if let Some(parent) = file_path.parent() {
        fs::create_dir_all(parent).expect("failed to create config parent");
    }
    fs::write(file_path, docstring(step)).expect("failed to write config file");
}

#[given("a config file containing:")]
#[given("the config file contains:")]
async fn config_file_default(world: &mut AcceptanceWorld, step: &Step) {
    let workspace = ensure_workspace(world);
    let default_path = workspace.join(".config/zen-profile-backup/settings.toml");
    if let Some(parent) = default_path.parent() {
        fs::create_dir_all(parent).expect("failed to create default config parent");
    }
    fs::write(default_path, docstring(step)).expect("failed to write default config file");
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

#[given("a profile directory containing:")]
async fn profile_directory_contains(world: &mut AcceptanceWorld, step: &Step) {
    let workspace = ensure_workspace(world);
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    world.profile_dir = Some(profile_dir.clone());

    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let file_index = *headers.get("file").expect("missing file column");

    for row in table.rows.iter().skip(1) {
        let file = row[file_index].trim();
        if file.is_empty() {
            continue;
        }
        let path = profile_dir.join(file);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create parent path");
        }
        if is_sqlite_file(file) {
            create_sqlite_db(&path);
        } else {
            fs::write(path, b"fixture").expect("failed to write fixture file");
        }
    }
}

#[given("a backup directory exists at the configured path")]
async fn backup_directory_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let profile_dir = world
        .profile_dir
        .clone()
        .unwrap_or_else(|| workspace.join("profile"));
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    world.profile_dir = Some(profile_dir.clone());

    let backup_dir = workspace.join("backups");
    fs::create_dir_all(&backup_dir).expect("failed to create backup dir");
    world.backup_dir = Some(backup_dir.clone());

    write_settings_for_profile(&workspace, &profile_dir, &backup_dir);
}

#[given(expr = "a valid backup archive {string} exists")]
async fn valid_backup_archive_exists(world: &mut AcceptanceWorld, archive_name: String) {
    let workspace = ensure_workspace(world);
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    world.profile_dir = Some(profile_dir.clone());

    let backup_dir = workspace.join("backups");
    let daily_dir = backup_dir.join("daily");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    world.backup_dir = Some(backup_dir.clone());
    world.pending_restore_archive = Some(daily_dir.join(archive_name));

    write_settings_for_profile(&workspace, &profile_dir, &backup_dir);
}

#[given("the archive contains:")]
async fn archive_contains(world: &mut AcceptanceWorld, step: &Step) {
    let archive_path = world
        .pending_restore_archive
        .clone()
        .expect("pending archive path not initialized");
    let staging_dir = tempfile::tempdir().expect("failed to create archive staging dir");

    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let file_index = *headers.get("file").expect("missing file column");
    for row in table.rows.iter().skip(1) {
        let file = row[file_index].trim();
        if file.is_empty() {
            continue;
        }
        let path = staging_dir.path().join(file);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create archive file parent");
        }
        if is_sqlite_file(file) {
            create_sqlite_db(&path);
        } else {
            fs::write(path, b"archive-fixture").expect("failed to write archive fixture file");
        }
    }

    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).expect("failed to create archive parent");
    }
    let output = Command::new("tar")
        .arg("-czf")
        .arg(&archive_path)
        .arg("-C")
        .arg(staging_dir.path())
        .arg(".")
        .output()
        .expect("failed to run tar for archive creation");
    assert!(
        output.status.success(),
        "failed to create archive: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

#[given("the current profile directory exists with different content")]
async fn profile_directory_with_different_content(world: &mut AcceptanceWorld) {
    let profile_dir = world
        .profile_dir
        .clone()
        .expect("profile dir should exist before seeding");
    fs::create_dir_all(&profile_dir).expect("failed to ensure profile dir");
    fs::write(
        profile_dir.join("prefs.js"),
        b"user_pref(\"different\", true);",
    )
    .expect("failed to write profile fixture");
    create_sqlite_db(&profile_dir.join("places.sqlite"));
}

#[given("the Zen browser is not running")]
async fn zen_browser_not_running(world: &mut AcceptanceWorld) {
    world.env.remove("ZEN_BACKUP_BROWSER_RUNNING");
}

#[given("a Zen browser process is running")]
async fn zen_browser_running(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_BROWSER_RUNNING".to_string(), "1".to_string());
}

#[given("the backup tool is installed")]
async fn backup_tool_installed(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let profile_dir = workspace
        .join("Library")
        .join("Application Support")
        .join("zen")
        .join("Profiles")
        .join("default");
    fs::create_dir_all(&profile_dir).expect("failed to create detected profile path");
    run_command(world, "install");
    assert_eq!(world.exit_code, 0, "install failed: {}", world.stderr);
}

#[given(expr = "{string} was run")]
async fn command_was_run(world: &mut AcceptanceWorld, command: String) {
    run_command(world, &command);
    assert_eq!(world.exit_code, 0, "command failed: {}", world.stderr);
}

#[given("backup archives exist in the backup directory")]
async fn backup_archives_exist(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let archive = backup_dir
        .join("daily")
        .join("zen-backup-daily-2026-01-15.tar.gz");
    if let Some(parent) = archive.parent() {
        fs::create_dir_all(parent).expect("failed to create archive parent");
    }
    fs::write(&archive, b"archive").expect("failed to write backup archive");
    world.tracked_backup_archives.push(archive);
}

#[given("settings.toml exists")]
async fn settings_toml_exists(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = workspace.join(".config/zen-profile-backup/settings.toml");
    if !config_path.exists() {
        ensure_backup_workspace(world);
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

#[when("a daily backup is created")]
async fn backup_daily(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    run_command(world, "backup daily");
}

#[when("a weekly backup is created")]
async fn backup_weekly(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    run_command(world, "backup weekly");
}

#[when(expr = "restore is run with archive {string}")]
async fn restore_with_archive(world: &mut AcceptanceWorld, archive_name: String) {
    run_command(world, &format!("restore {archive_name}"));
}

#[when(expr = "{string} is run")]
async fn quoted_command_run(world: &mut AcceptanceWorld, command: String) {
    run_command(world, &command);
}

#[when("the uninstall command is run")]
async fn uninstall_command_run(world: &mut AcceptanceWorld) {
    run_command(world, "uninstall");
}

#[when("the configuration is loaded")]
async fn configuration_loaded(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let env_guard = EnvGuard::from_world(world);
    match load_config(true, &workspace) {
        Ok(Some(config)) => {
            world.exit_code = 0;
            world.stderr.clear();
            world.loaded_config = Some(config);
        }
        Ok(None) => {
            world.exit_code = 1;
            world.stderr = "config file not found".to_string();
            world.loaded_config = None;
        }
        Err(error) => {
            world.exit_code = 1;
            world.stderr = match error {
                zen_backup::config::ConfigError::NotFound(message)
                | zen_backup::config::ConfigError::Parse(message) => message,
            };
            world.loaded_config = None;
        }
    }
    drop(env_guard);
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

#[then(expr = "stderr contains {string}")]
async fn stderr_contains(world: &mut AcceptanceWorld, needle: String) {
    assert!(
        world.stderr.contains(&needle),
        "expected stderr to contain `{needle}`, got `{}`",
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

#[then(expr = "profile.path equals the expanded value of {string}")]
async fn profile_path_equals_expanded(world: &mut AcceptanceWorld, raw_path: String) {
    let profile_path = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded")
        .profile_path
        .clone();
    let home = ensure_workspace(world);
    let expected = if let Some(suffix) = raw_path.strip_prefix("~/") {
        home.join(suffix).display().to_string()
    } else {
        raw_path
    };
    assert_eq!(profile_path, expected);
}

#[then(expr = "an archive exists matching pattern {string}")]
async fn archive_exists_matching_pattern(world: &mut AcceptanceWorld, pattern: String) {
    let archive = world
        .last_archive
        .as_ref()
        .expect("expected archive path from backup output");
    assert!(
        archive.exists(),
        "archive does not exist at {}",
        archive.display()
    );
    let name = archive
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    let matches = if pattern.contains("zen-backup-daily-") {
        name.starts_with("zen-backup-daily-") && name.ends_with(".tar.gz") && name.len() >= 30
    } else if pattern.contains("zen-backup-weekly-") {
        name.starts_with("zen-backup-weekly-") && name.ends_with(".tar.gz") && name.len() >= 31
    } else {
        false
    };
    assert!(
        matches,
        "archive `{name}` does not satisfy expected pattern `{pattern}`"
    );
}

#[then(expr = "the archive is in the {string} subdirectory")]
async fn archive_in_subdirectory(world: &mut AcceptanceWorld, subdirectory: String) {
    let archive = world
        .last_archive
        .as_ref()
        .expect("expected archive path from backup output");
    let parent = archive
        .parent()
        .and_then(|value| value.file_name())
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    assert_eq!(parent, subdirectory, "archive parent directory mismatch");
}

#[then(expr = "the profile directory contains {string}")]
async fn profile_directory_contains_file(world: &mut AcceptanceWorld, file_name: String) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    assert!(
        profile_dir.join(file_name).exists(),
        "expected file in profile after restore"
    );
}

#[then(expr = "{string} in the profile passes {string}")]
async fn profile_file_passes_check(world: &mut AcceptanceWorld, file_name: String, sql: String) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    let target = profile_dir.join(file_name);
    let output = Command::new("sqlite3")
        .arg(target)
        .arg(sql)
        .output()
        .expect("failed to run sqlite3");
    assert!(
        output.status.success(),
        "sqlite command failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
    assert!(
        text.contains("ok"),
        "expected sqlite integrity check to include ok"
    );
}

#[then("stdout contains the archive path")]
async fn stdout_contains_archive_path(world: &mut AcceptanceWorld) {
    let archive = world
        .pending_restore_archive
        .as_ref()
        .expect("expected pending restore archive path");
    let file_name = archive
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    assert!(
        world.stdout.contains(file_name),
        "stdout did not include archive path reference"
    );
}

#[then(expr = "stdout lists {string}")]
async fn stdout_lists(world: &mut AcceptanceWorld, value: String) {
    assert!(
        world.stdout.contains(&value),
        "expected stdout to list `{value}`, got `{}`",
        world.stdout
    );
}

#[then(expr = "a macOS notification is displayed with title {string}")]
async fn macos_notification_with_title(world: &mut AcceptanceWorld, title: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let path = backup_dir.join("notifications.log");
    let content = fs::read_to_string(path).expect("expected notifications.log");
    assert!(
        content.contains(&title),
        "expected notification title `{title}` in notifications log"
    );
}

#[then(expr = "the notification contains {string}")]
async fn notification_contains(world: &mut AcceptanceWorld, text: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let path = backup_dir.join("notifications.log");
    let content = fs::read_to_string(path).expect("expected notifications.log");
    assert!(
        content.to_lowercase().contains(&text.to_lowercase()),
        "expected notification text `{text}` in notifications log"
    );
}

#[then("the backup completes successfully")]
async fn backup_completes_successfully(world: &mut AcceptanceWorld) {
    assert_eq!(world.exit_code, 0, "backup should complete successfully");
}

#[then("all backup archives still exist")]
async fn all_backup_archives_still_exist(world: &mut AcceptanceWorld) {
    assert!(
        !world.tracked_backup_archives.is_empty(),
        "no tracked archives available for assertion"
    );
    for archive in &world.tracked_backup_archives {
        assert!(
            archive.exists(),
            "expected backup archive to be preserved: {}",
            archive.display()
        );
    }
}

#[then("settings.toml does not exist")]
async fn settings_toml_missing(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = workspace.join(".config/zen-profile-backup/settings.toml");
    assert!(
        !config_path.exists(),
        "settings.toml should be removed by uninstall"
    );
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

    let backup_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/backup.feature");
    AcceptanceWorld::filter_run(backup_feature, |feature, _, scenario| {
        feature.name == "Backup"
            && matches!(
                scenario.name.as_str(),
                "Create a daily backup manually" | "Create a weekly backup manually"
            )
    })
    .await;

    let restore_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/restore.feature");
    AcceptanceWorld::filter_run(restore_feature, |feature, _, scenario| {
        feature.name == "Restore" && scenario.name == "Restore from a daily backup"
    })
    .await;

    let scheduling_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/scheduling.feature");
    AcceptanceWorld::filter_run(scheduling_feature, |feature, _, scenario| {
        feature.name == "Scheduling"
            && matches!(
                scenario.name.as_str(),
                "Schedule status reports daily and weekly states"
                    | "Schedule stop disables scheduled jobs without uninstalling"
                    | "Schedule start enables paused jobs"
            )
    })
    .await;

    let notifications_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/notifications.feature");
    AcceptanceWorld::filter_run(notifications_feature, |feature, _, scenario| {
        feature.name == "Notifications"
            && scenario.name
                == "Warning notification via terminal-notifier or osascript when browser is running"
    })
    .await;

    let install_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/install.feature");
    AcceptanceWorld::filter_run(install_feature, |feature, _, scenario| {
        feature.name == "Install"
            && matches!(
                scenario.name.as_str(),
                "Uninstall preserves backup archives"
                    | "Uninstall removes settings.toml"
                    | "Uninstall warns when backups are preserved"
            )
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
    let normalized = command
        .strip_prefix("zen-backup ")
        .unwrap_or(command)
        .trim();
    let args: Vec<&str> = normalized.split_whitespace().collect();
    let output = Command::new(resolve_cli_path())
        .args(&args)
        .current_dir(workspace.path())
        .env("HOME", workspace.path())
        .env("ZEN_BACKUP_TEST_OS", "darwin")
        .envs(world.env.clone())
        .output()
        .expect("failed to execute zen-backup");

    world.exit_code = output.status.code().unwrap_or(1);
    world.stdout = String::from_utf8_lossy(&output.stdout)
        .trim_end()
        .to_string();
    world.stderr = String::from_utf8_lossy(&output.stderr)
        .trim_end()
        .to_string();
    world.last_archive = extract_archive_path(&world.stdout);
}

struct EnvGuard {
    saved: Vec<(String, Option<String>)>,
}

impl EnvGuard {
    fn from_world(world: &AcceptanceWorld) -> Self {
        let mut saved = Vec::new();
        let workspace = world.workspace.as_ref().expect("workspace not initialized");
        set_env_capture("HOME", workspace.path().display().to_string(), &mut saved);
        set_env_capture("ZEN_BACKUP_TEST_OS", "darwin".to_string(), &mut saved);
        for (key, value) in &world.env {
            set_env_capture(key, value.clone(), &mut saved);
        }
        Self { saved }
    }
}

impl Drop for EnvGuard {
    fn drop(&mut self) {
        for (key, previous) in self.saved.iter().rev() {
            if let Some(value) = previous {
                std::env::set_var(key, value);
            } else {
                std::env::remove_var(key);
            }
        }
    }
}

fn set_env_capture(key: &str, value: String, saved: &mut Vec<(String, Option<String>)>) {
    let previous = std::env::var(key).ok();
    saved.push((key.to_string(), previous));
    std::env::set_var(key, value);
}

fn ensure_backup_workspace(world: &mut AcceptanceWorld) {
    if world.profile_dir.is_some() && world.backup_dir.is_some() {
        return;
    }
    let workspace = ensure_workspace(world);
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    create_sqlite_db(&profile_dir.join("places.sqlite"));
    world.profile_dir = Some(profile_dir.clone());

    let backup_dir = workspace.join("backups");
    fs::create_dir_all(&backup_dir).expect("failed to create backup dir");
    world.backup_dir = Some(backup_dir.clone());

    write_settings_for_profile(&workspace, &profile_dir, &backup_dir);
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

fn docstring(step: &Step) -> String {
    step.docstring
        .as_ref()
        .cloned()
        .expect("expected docstring content")
}

fn extract_archive_path(stdout: &str) -> Option<PathBuf> {
    let marker = "Created ";
    let path_marker = " backup: ";
    for line in stdout.lines() {
        if line.starts_with(marker) && line.contains(path_marker) {
            let path = line.split(path_marker).nth(1)?;
            return Some(PathBuf::from(path.trim()));
        }
    }
    None
}

fn write_settings_for_profile(workspace: &Path, profile_dir: &Path, backup_dir: &Path) {
    let config_dir = workspace.join(".config/zen-profile-backup");
    fs::create_dir_all(&config_dir).expect("failed to create config dir");
    let config_body = format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n",
        profile_dir.display(),
        backup_dir.display(),
    );
    fs::write(config_dir.join("settings.toml"), config_body).expect("failed to write settings");
}

fn is_sqlite_file(path: &str) -> bool {
    path.ends_with(".sqlite") || path.ends_with(".db")
}

fn create_sqlite_db(path: &Path) {
    let output = Command::new("sqlite3")
        .arg(path)
        .arg("CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT);")
        .output()
        .expect("failed to execute sqlite3");
    assert!(
        output.status.success(),
        "failed to create sqlite db: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
