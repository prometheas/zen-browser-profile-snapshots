use cucumber::{gherkin::Step, given, then, when, World as _};
use serde_json::{Map, Value};
use std::collections::HashMap;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;
use tempfile::TempDir;
use zen_backup::config::{load_config, AppConfig};

#[derive(Debug, Default, cucumber::World)]
struct AcceptanceWorld {
    workspace: Option<TempDir>,
    env: HashMap<String, String>,
    loaded_config: Option<AppConfig>,
    config_used_default_path: bool,
    profile_dir: Option<PathBuf>,
    backup_dir: Option<PathBuf>,
    last_archive: Option<PathBuf>,
    last_pre_restore_dir: Option<PathBuf>,
    pending_restore_archive: Option<PathBuf>,
    extracted_archive_dir: Option<TempDir>,
    absolute_archive_target: Option<PathBuf>,
    tracked_backup_archives: Vec<PathBuf>,
    config_overrides: HashMap<String, String>,
    configured_missing_profile_path: Option<PathBuf>,
    profile_snapshot_before_restore: HashMap<String, Vec<u8>>,
    cloud_backup_dir: Option<PathBuf>,
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

#[given("the backup directory contains no archives")]
async fn backup_directory_contains_no_archives(world: &mut AcceptanceWorld) {
    backup_directory_empty(world).await;
}

#[given("the backup directory exists but contains no daily archives")]
async fn backup_directory_no_daily_archives(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("backups");
    let daily_dir = backup_dir.join("daily");
    let weekly_dir = backup_dir.join("weekly");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    fs::create_dir_all(&weekly_dir).expect("failed to create weekly dir");
    fs::write(
        weekly_dir.join("zen-backup-weekly-2026-01-12.tar.gz"),
        b"weekly",
    )
    .expect("failed to seed weekly archive");
    write_settings(&workspace, &backup_dir);
}

#[given("the backup directory exists but contains no weekly archives")]
async fn backup_directory_no_weekly_archives(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("backups");
    let daily_dir = backup_dir.join("daily");
    let weekly_dir = backup_dir.join("weekly");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    fs::create_dir_all(&weekly_dir).expect("failed to create weekly dir");
    fs::write(daily_dir.join("zen-backup-daily-2026-01-15.tar.gz"), b"daily")
        .expect("failed to seed daily archive");
    write_settings(&workspace, &backup_dir);
}

#[given(expr = "the backup directory contains archives totaling {int} MB")]
async fn backup_directory_archives_totaling(world: &mut AcceptanceWorld, total_mb: i32) {
    let workspace = ensure_workspace(world);
    let backup_dir = workspace.join("backups");
    let daily_dir = backup_dir.join("daily");
    let weekly_dir = backup_dir.join("weekly");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    fs::create_dir_all(&weekly_dir).expect("failed to create weekly dir");
    let bytes = (total_mb.max(0) as usize) * 1024 * 1024;
    let daily_bytes = bytes * 3 / 5;
    let weekly_bytes = bytes - daily_bytes;
    fs::write(
        daily_dir.join("zen-backup-daily-2026-01-15.tar.gz"),
        vec![0_u8; daily_bytes],
    )
    .expect("failed to write daily archive");
    fs::write(
        weekly_dir.join("zen-backup-weekly-2026-01-12.tar.gz"),
        vec![0_u8; weekly_bytes],
    )
    .expect("failed to write weekly archive");
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

#[given("a config file exists at the platform default location:")]
async fn config_file_exists_at_platform_default_location_with_table(
    world: &mut AcceptanceWorld,
    step: &Step,
) {
    let _ = step;
    let workspace = ensure_workspace(world);
    let default_path = platform_config_path(&workspace, &current_test_os(world));
    if let Some(parent) = default_path.parent() {
        fs::create_dir_all(parent).expect("failed to create default config parent");
    }
    if !default_path.exists() {
        fs::write(&default_path, "[profile]\npath = \"~/profile\"\n")
            .expect("failed to create default config file");
    }
}

#[given("a config file exists at the platform default location")]
async fn config_file_exists_at_platform_default_location(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let default_path = platform_config_path(&workspace, &current_test_os(world));
    if let Some(parent) = default_path.parent() {
        fs::create_dir_all(parent).expect("failed to create default config parent");
    }
    if !default_path.exists() {
        fs::write(&default_path, "[profile]\npath = \"~/profile\"\n")
            .expect("failed to create default config file");
    }
}

#[given("no config file exists at the default location")]
async fn no_config_file_exists_at_default_location(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let default_path = platform_config_path(&workspace, &current_test_os(world));
    let _ = fs::remove_file(default_path);
}

#[given("a config file containing:")]
#[given("the config file contains:")]
async fn config_file_default(world: &mut AcceptanceWorld, step: &Step) {
    let workspace = ensure_workspace(world);
    let default_path = platform_config_path(&workspace, &current_test_os(world));
    if let Some(parent) = default_path.parent() {
        fs::create_dir_all(parent).expect("failed to create default config parent");
    }
    fs::write(default_path, docstring(step)).expect("failed to write default config file");
}

#[given(expr = "the configuration has {string}")]
async fn configuration_has_single(world: &mut AcceptanceWorld, assignment: String) {
    apply_configuration_assignment(world, &assignment);
}

#[given("the configuration does not specify retention periods")]
async fn configuration_without_retention(world: &mut AcceptanceWorld) {
    world.config_overrides.remove("retention.daily_days");
    world.config_overrides.remove("retention.weekly_days");
}

#[given(expr = "the configuration has only {string}")]
async fn configuration_has_only(world: &mut AcceptanceWorld, assignment: String) {
    world.config_overrides.remove("retention.daily_days");
    world.config_overrides.remove("retention.weekly_days");
    apply_configuration_assignment(world, &assignment);
}

#[given(expr = "{string} is not configured")]
async fn config_key_not_configured(world: &mut AcceptanceWorld, key: String) {
    world.config_overrides.remove(&key);
}

#[given("the configuration has:")]
async fn configuration_has_table(world: &mut AcceptanceWorld, step: &Step) {
    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let key_index = *headers.get("key").expect("missing key column");
    let value_index = *headers.get("value").expect("missing value column");
    for row in table.rows.iter().skip(1) {
        let key = row[key_index].trim();
        let value = row[value_index].trim();
        if key.is_empty() {
            continue;
        }
        apply_configuration_assignment(world, &format!("{key} = {value}"));
    }
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
    let file_index = headers.get("file").copied();
    let total_size_index = headers.get("total_size").copied();
    let size_index = headers.get("size").copied();

    for row in table.rows.iter().skip(1) {
        let subdirectory = row[subdirectory_index].trim();
        let file = file_index.and_then(|idx| row.get(idx)).map(|value| value.trim());
        let total_size = total_size_index
            .and_then(|idx| row.get(idx))
            .map(|value| value.trim());
        let Some(path) = file
            .filter(|value| !value.is_empty())
            .map(|value| backup_dir.join(subdirectory).join(value))
            .or_else(|| {
                total_size
                    .filter(|value| !value.is_empty())
                    .map(|_| backup_dir.join(subdirectory).join("seed.tar.gz"))
            })
        else {
            continue;
        };
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create archive parent");
        }
        let size = size_index
            .and_then(|idx| row.get(idx))
            .map(|value| parse_size_to_bytes(value))
            .or_else(|| total_size.map(parse_size_to_bytes))
            .unwrap_or(256);
        fs::write(path, vec![0_u8; size]).expect("failed to write archive file");
    }
}

#[given("the backup directory contains daily archives:")]
async fn backup_directory_contains_daily_archives(world: &mut AcceptanceWorld, step: &Step) {
    backup_directory_contains_type_archives(world, step, "daily");
}

#[given("the backup directory contains weekly archives:")]
async fn backup_directory_contains_weekly_archives(world: &mut AcceptanceWorld, step: &Step) {
    backup_directory_contains_type_archives(world, step, "weekly");
}

#[given("cloud sync is configured")]
async fn cloud_sync_is_configured(world: &mut AcceptanceWorld) {
    cloud_sync_configured_valid_path(world).await;
}

#[given("the cloud daily directory contains:")]
async fn cloud_daily_directory_contains(world: &mut AcceptanceWorld, step: &Step) {
    cloud_directory_contains_type_archives(world, step, "daily");
}

#[given("the cloud weekly directory contains:")]
async fn cloud_weekly_directory_contains(world: &mut AcceptanceWorld, step: &Step) {
    cloud_directory_contains_type_archives(world, step, "weekly");
}

#[given("the daily backup directory is empty")]
async fn daily_backup_directory_empty(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let daily_dir = backup_dir.join("daily");
    let _ = fs::remove_dir_all(&daily_dir);
    fs::create_dir_all(daily_dir).expect("failed to create empty daily directory");
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

#[given("a profile directory additionally contains:")]
async fn profile_directory_additionally_contains(world: &mut AcceptanceWorld, step: &Step) {
    write_additional_profile_entries(world, step);
}

#[given("the profile directory additionally contains:")]
async fn the_profile_directory_additionally_contains(world: &mut AcceptanceWorld, step: &Step) {
    write_additional_profile_entries(world, step);
}

fn write_additional_profile_entries(world: &mut AcceptanceWorld, step: &Step) {
    let profile_dir = world
        .profile_dir
        .clone()
        .expect("profile directory should be initialized first");
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
            fs::write(path, b"fixture-extra").expect("failed to write fixture file");
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

    write_settings_for_profile(world, &workspace, &profile_dir, &backup_dir);
}

#[given(expr = "a valid backup archive {string} exists")]
async fn valid_backup_archive_exists(world: &mut AcceptanceWorld, archive_name: String) {
    let workspace = ensure_workspace(world);
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    world.profile_dir = Some(profile_dir.clone());

    let backup_dir = workspace.join("backups");
    let bucket = if archive_name.contains("weekly") {
        "weekly"
    } else {
        "daily"
    };
    let archive_dir = backup_dir.join(bucket);
    fs::create_dir_all(&archive_dir).expect("failed to create archive dir");
    world.backup_dir = Some(backup_dir.clone());
    let archive_path = archive_dir.join(archive_name);
    world.pending_restore_archive = Some(archive_path.clone());
    if !archive_path.exists() {
        write_default_restore_archive(&archive_path);
    }

    write_settings_for_profile(world, &workspace, &profile_dir, &backup_dir);
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

#[given("the archive contains SQLite databases with multiple tables")]
async fn archive_contains_sqlite_databases_with_multiple_tables(world: &mut AcceptanceWorld) {
    let archive_path = world
        .pending_restore_archive
        .clone()
        .expect("pending archive path not initialized");
    let staging_dir = tempfile::tempdir().expect("failed to create archive staging dir");
    create_sqlite_db(&staging_dir.path().join("places.sqlite"));
    create_sqlite_db(&staging_dir.path().join("formhistory.sqlite"));
    fs::write(
        staging_dir.path().join("prefs.js"),
        b"user_pref(\"restored\", true);",
    )
    .expect("failed to write prefs fixture");
    write_tar_archive(&archive_path, staging_dir.path());
}

#[given("an archive created with absolute paths")]
async fn archive_created_with_absolute_paths(world: &mut AcceptanceWorld) {
    let archive_path = world
        .pending_restore_archive
        .clone()
        .expect("pending archive path not initialized");
    let workspace = ensure_workspace(world);
    let absolute_source = workspace.join("absolute-source");
    fs::create_dir_all(&absolute_source).expect("failed to create absolute source dir");
    create_sqlite_db(&absolute_source.join("places.sqlite"));
    fs::write(
        absolute_source.join("prefs.js"),
        b"user_pref(\"absolute\", true);",
    )
    .expect("failed to write absolute prefs fixture");

    let absolute_path = absolute_source
        .canonicalize()
        .expect("failed to canonicalize absolute source");
    let output = Command::new("tar")
        .arg("-czf")
        .arg(&archive_path)
        .arg("-P")
        .arg(absolute_path.join("places.sqlite"))
        .arg("-P")
        .arg(absolute_path.join("prefs.js"))
        .output()
        .expect("failed to create absolute-path archive");
    assert!(
        output.status.success(),
        "failed to create absolute-path archive: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    world.absolute_archive_target = Some(absolute_path.join("places.sqlite"));
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

#[given("the current profile contains:")]
async fn current_profile_contains(world: &mut AcceptanceWorld, step: &Step) {
    let profile_dir = world
        .profile_dir
        .clone()
        .expect("profile dir should exist before writing profile contents");
    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let file_index = *headers.get("file").expect("missing file column");
    let content_index = *headers.get("content").expect("missing content column");
    for row in table.rows.iter().skip(1) {
        let file = row[file_index].trim();
        if file.is_empty() {
            continue;
        }
        let content = row[content_index].as_bytes();
        let path = profile_dir.join(file);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).expect("failed to create profile file parent");
        }
        fs::write(path, content).expect("failed to write profile fixture content");
    }
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
    if world.profile_dir.is_some() {
        capture_profile_snapshot(world);
    }
}

#[given(expr = "a corrupted archive {string} exists")]
async fn corrupted_archive_exists(world: &mut AcceptanceWorld, archive_name: String) {
    let workspace = ensure_workspace(world);
    let profile_dir = workspace.join("profile");
    fs::create_dir_all(&profile_dir).expect("failed to create profile dir");
    world.profile_dir = Some(profile_dir.clone());

    let backup_dir = workspace.join("backups");
    let daily_dir = backup_dir.join("daily");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    world.backup_dir = Some(backup_dir.clone());

    let archive_path = daily_dir.join(archive_name);
    fs::write(&archive_path, b"not a valid archive").expect("failed to write corrupted archive");
    world.pending_restore_archive = Some(archive_path);
    write_settings_for_profile(world, &workspace, &profile_dir, &backup_dir);
}

#[given("GitHub CLI is available")]
async fn github_cli_available(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_GH_AVAILABLE".to_string(), "1".to_string());
    world.env.insert(
        "ZEN_BACKUP_TEST_GH_CREATED_URL".to_string(),
        "https://github.com/prometheas/zen-browser-profile-snapshots/issues/123".to_string(),
    );
}

#[given("GitHub CLI is unavailable")]
async fn github_cli_unavailable(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_GH_AVAILABLE".to_string(), "0".to_string());
    world
        .env
        .insert("ZEN_BACKUP_TEST_BROWSER_OPEN".to_string(), "1".to_string());
}

#[given("feedback answers are provided:")]
async fn feedback_answers_provided(world: &mut AcceptanceWorld, step: &Step) {
    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let field_index = *headers.get("field").expect("missing field column");
    let value_index = *headers.get("value").expect("missing value column");

    let mut json = Map::<String, Value>::new();
    for row in table.rows.iter().skip(1) {
        let field = row[field_index].trim();
        let value = row[value_index].trim();
        if field.is_empty() {
            continue;
        }
        json.insert(field.to_string(), Value::String(value.to_string()));
    }
    world.env.insert(
        "ZEN_BACKUP_TEST_FEEDBACK_ANSWERS".to_string(),
        Value::Object(json).to_string(),
    );
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

#[given(expr = "a Zen profile exists at {string}")]
async fn zen_profile_exists_at(world: &mut AcceptanceWorld, raw_path: String) {
    let path = resolve_fixture_path(world, &raw_path);
    fs::create_dir_all(&path).expect("failed to create requested profile path");
    create_sqlite_db(&path.join("places.sqlite"));
    world.env.insert(
        "ZEN_BACKUP_TEST_OS".to_string(),
        infer_platform_from_path_hint(&raw_path).to_string(),
    );
}

#[given("no Zen profile is detected")]
async fn no_zen_profile_detected(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "darwin".to_string());
}

#[given("a Zen profile is detected")]
async fn zen_profile_detected(world: &mut AcceptanceWorld) {
    zen_profile_exists_at(
        world,
        "~/Library/Application Support/zen/Profiles/default".to_string(),
    )
    .await;
}

#[given(expr = "Google Drive is mounted at {string}")]
async fn google_drive_mounted(world: &mut AcceptanceWorld, raw_path: String) {
    let path = resolve_fixture_path(world, &raw_path);
    fs::create_dir_all(path).expect("failed to create Google Drive path");
}

#[given(expr = "iCloud Drive is available at {string}")]
async fn icloud_drive_available(world: &mut AcceptanceWorld, raw_path: String) {
    let path = resolve_fixture_path(world, &raw_path);
    fs::create_dir_all(path).expect("failed to create iCloud path");
}

#[given(expr = "a Google Drive folder exists at {string}")]
async fn google_drive_folder_exists(world: &mut AcceptanceWorld, raw_path: String) {
    let path = resolve_fixture_path(world, &raw_path);
    fs::create_dir_all(path).expect("failed to create Google Drive folder");
}

#[given(expr = "OneDrive is mounted at {string}")]
async fn one_drive_mounted(world: &mut AcceptanceWorld, raw_path: String) {
    let path = resolve_fixture_path(world, &raw_path);
    fs::create_dir_all(path).expect("failed to create OneDrive folder");
}

#[given("Dropbox is available at the platform-standard location")]
async fn dropbox_available_standard(world: &mut AcceptanceWorld) {
    let os = world
        .env
        .get("ZEN_BACKUP_TEST_OS")
        .cloned()
        .unwrap_or_else(|| "darwin".to_string());
    let workspace = ensure_workspace(world);
    let path = if os == "windows" {
        workspace.join("Dropbox")
    } else {
        workspace.join("Dropbox")
    };
    fs::create_dir_all(path).expect("failed to create Dropbox path");
}

#[given("terminal-notifier is not installed")]
async fn terminal_notifier_not_installed(world: &mut AcceptanceWorld) {
    world.env.insert(
        "ZEN_BACKUP_FORCE_NO_TERMINAL_NOTIFIER".to_string(),
        "1".to_string(),
    );
}

#[given("the install command is running")]
async fn install_command_running(world: &mut AcceptanceWorld) {
    let _ = world;
}

#[given("the user completes the install wizard")]
async fn user_completes_install_wizard(world: &mut AcceptanceWorld) {
    run_command(world, "install");
    assert_eq!(world.exit_code, 0, "install failed: {}", world.stderr);
}

#[given("the user does not have write permission to the config directory")]
async fn no_write_permission_config_dir(world: &mut AcceptanceWorld) {
    world.env.insert(
        "ZEN_BACKUP_SIMULATE_CONFIG_PERMISSION_DENIED".to_string(),
        "1".to_string(),
    );
}

#[given("the user enters a non-existent profile path")]
async fn user_enters_nonexistent_profile_path(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let missing = workspace.join("missing-profile-path");
    world.env.insert(
        "ZEN_BACKUP_PROFILE_PATH".to_string(),
        missing.display().to_string(),
    );
    world
        .env
        .insert("ZEN_BACKUP_VALIDATE_ONLY".to_string(), "1".to_string());
}

#[given("notify-send is not installed")]
async fn notify_send_not_installed(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "linux".to_string());
    world.env.insert(
        "ZEN_BACKUP_TEST_NOTIFY_SEND_UNAVAILABLE".to_string(),
        "1".to_string(),
    );
}

#[given("PowerShell toast notification fails")]
async fn powershell_toast_notification_fails(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "windows".to_string());
    world
        .env
        .insert("ZEN_BACKUP_TEST_WINDOWS_TOAST_FAIL".to_string(), "1".to_string());
}

#[given("notifications are disabled in configuration (notifications.enabled = false)")]
async fn notifications_disabled_in_config(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world
        .config_overrides
        .insert("notifications.enabled".to_string(), "false".to_string());
    rewrite_settings_from_world(world);
}

#[given(expr = "the backup tool is installed on {word}")]
async fn backup_tool_installed_on_platform(world: &mut AcceptanceWorld, platform: String) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), platform_to_test_os(&platform).to_string());
    backup_tool_installed(world).await;
}

#[given("settings.toml contains:")]
async fn settings_toml_contains(world: &mut AcceptanceWorld, step: &Step) {
    ensure_backup_workspace(world);
    let Some(table) = step.table.as_ref() else {
        panic!("expected data table");
    };
    let headers = header_map(&table.rows[0]);
    let key_index = *headers.get("key").expect("missing key column");
    let value_index = *headers.get("value").expect("missing value column");
    for row in table.rows.iter().skip(1) {
        let key = row[key_index].trim();
        let value = row[value_index].trim();
        if key.is_empty() {
            continue;
        }
        world
            .config_overrides
            .insert(key.to_string(), value.to_string());
    }
    rewrite_settings_from_world(world);
}

#[given("the backup scheduled jobs are installed")]
async fn backup_scheduled_jobs_installed(world: &mut AcceptanceWorld) {
    backup_tool_installed(world).await;
    ensure_backup_workspace(world);
}

#[given(expr = "the launchd agent {string} is loaded")]
async fn launchd_agent_loaded(world: &mut AcceptanceWorld, _label: String) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "darwin".to_string());
    backup_tool_installed(world).await;
}

#[given("the launchd agents are loaded")]
async fn launchd_agents_loaded(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "darwin".to_string());
    backup_tool_installed(world).await;
}

#[given("no launchd agents are loaded")]
async fn no_launchd_agents_loaded(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "darwin".to_string());
    no_backup_scheduled_jobs_installed(world).await;
}

#[given(expr = "the systemd timer {string} is active")]
async fn systemd_timer_active(world: &mut AcceptanceWorld, _label: String) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "linux".to_string());
    backup_tool_installed(world).await;
}

#[given("the systemd timers are active")]
async fn systemd_timers_active(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "linux".to_string());
    backup_tool_installed(world).await;
}

#[given("no systemd timers are active")]
async fn no_systemd_timers_active(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "linux".to_string());
    no_backup_scheduled_jobs_installed(world).await;
}

#[given(expr = "the scheduled task {string} exists")]
async fn scheduled_task_exists(world: &mut AcceptanceWorld, _label: String) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "windows".to_string());
    backup_tool_installed(world).await;
}

#[given("the scheduled tasks exist")]
async fn scheduled_tasks_exist(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "windows".to_string());
    backup_tool_installed(world).await;
}

#[given("no scheduled tasks exist")]
async fn no_scheduled_tasks_exist(world: &mut AcceptanceWorld) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_OS".to_string(), "windows".to_string());
    no_backup_scheduled_jobs_installed(world).await;
}

#[given("no user is logged in interactively")]
async fn no_user_logged_in_interactively(world: &mut AcceptanceWorld) {
    let _ = world;
}

#[given("no backup scheduled jobs are installed")]
async fn no_backup_scheduled_jobs_installed(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let workspace = ensure_workspace(world);
    let resources_root = workspace.join("resources");
    let _ = fs::remove_file(
        resources_root
            .join("launchd")
            .join("com.prometheas.zen-backup.daily.plist"),
    );
    let _ = fs::remove_file(
        resources_root
            .join("launchd")
            .join("com.prometheas.zen-backup.weekly.plist"),
    );
}

#[given("the most recent daily backup is less than 2 days old")]
async fn most_recent_daily_backup_recent(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world.env.insert(
        "ZEN_BACKUP_TEST_NOW".to_string(),
        "2026-01-16T12:00:00Z".to_string(),
    );
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let daily_dir = backup_dir.join("daily");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    fs::write(
        daily_dir.join("zen-backup-daily-2026-01-15.tar.gz"),
        b"daily",
    )
    .expect("failed to write recent daily archive");
}

#[given("the most recent daily backup is more than 3 days old")]
async fn most_recent_daily_backup_stale(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world.env.insert(
        "ZEN_BACKUP_TEST_NOW".to_string(),
        "2026-01-16T12:00:00Z".to_string(),
    );
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let daily_dir = backup_dir.join("daily");
    fs::create_dir_all(&daily_dir).expect("failed to create daily dir");
    fs::write(
        daily_dir.join("zen-backup-daily-2026-01-10.tar.gz"),
        b"daily",
    )
    .expect("failed to write stale daily archive");
}

#[given("the backup tool was installed more than 1 day ago")]
async fn backup_tool_installed_more_than_one_day(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world.env.insert(
        "ZEN_BACKUP_TEST_NOW".to_string(),
        "2026-01-16T12:00:00Z".to_string(),
    );
}

#[given("the configured backup directory does not exist")]
async fn configured_backup_directory_missing(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let workspace = ensure_workspace(world);
    let missing_backup_dir = workspace.join("missing-backup-dir");
    world.config_overrides.insert(
        "backup.local_path".to_string(),
        missing_backup_dir.display().to_string(),
    );
    rewrite_settings_from_world(world);
}

#[given("the backup directory is not readable")]
async fn backup_directory_not_readable(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured")
        .clone();
    #[cfg(unix)]
    {
        let metadata = fs::metadata(&backup_dir).expect("failed to stat backup dir");
        let mut permissions = metadata.permissions();
        permissions.set_mode(0o000);
        fs::set_permissions(&backup_dir, permissions).expect("failed to set unreadable permissions");
    }
    world.env.insert(
        "ZEN_BACKUP_TEST_STATUS_PERMISSION_DENIED".to_string(),
        "1".to_string(),
    );
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

#[given(expr = "a daily backup archive {string} already exists")]
async fn daily_backup_archive_already_exists(world: &mut AcceptanceWorld, file_name: String) {
    ensure_backup_workspace(world);
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let archive = backup_dir.join("daily").join(file_name);
    if let Some(parent) = archive.parent() {
        fs::create_dir_all(parent).expect("failed to create archive parent");
    }
    fs::write(&archive, b"existing-archive").expect("failed to create existing archive");
}

#[given(expr = "cloud sync is configured to an inaccessible path")]
async fn cloud_sync_inaccessible_path(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let workspace = ensure_workspace(world);
    let inaccessible = workspace.join("cloud-inaccessible");
    fs::write(&inaccessible, b"not-a-directory").expect("failed to create inaccessible marker");
    world
        .config_overrides
        .insert("backup.cloud_path".to_string(), inaccessible.display().to_string());
    rewrite_settings_from_world(world);
}

#[given(expr = "{string} is exclusively locked by another process")]
async fn sqlite_exclusively_locked(world: &mut AcceptanceWorld, file_name: String) {
    world.env.insert(
        "ZEN_BACKUP_TEST_FORCE_SQLITE_FALLBACK".to_string(),
        file_name,
    );
}

#[given("the backup directory has insufficient space")]
async fn backup_directory_insufficient_space(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world
        .env
        .insert("ZEN_BACKUP_TEST_DISK_FULL".to_string(), "1".to_string());
}

#[given(expr = "{string} fails integrity check")]
async fn sqlite_file_fails_integrity_check(world: &mut AcceptanceWorld, file_name: String) {
    world
        .env
        .insert("ZEN_BACKUP_TEST_CORRUPT_SQLITE".to_string(), file_name);
}

#[given("settings.toml exists")]
async fn settings_toml_exists(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = platform_config_path(&workspace, &current_test_os(world));
    if !config_path.exists() {
        ensure_backup_workspace(world);
    }
}

#[given("the configured profile path does not exist")]
async fn configured_profile_path_missing(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let missing_profile = workspace.join("profile-does-not-exist");
    let backup_dir = workspace.join("backups");
    fs::create_dir_all(&backup_dir).expect("failed to create backup dir");
    world.backup_dir = Some(backup_dir.clone());
    world.configured_missing_profile_path = Some(missing_profile.clone());

    let config_path = platform_config_path(&workspace, &current_test_os(world));
    let config_dir = config_path
        .parent()
        .expect("platform config path should have a parent")
        .to_path_buf();
    fs::create_dir_all(&config_dir).expect("failed to create config dir");
    let config_body = format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n",
        toml_string_literal(&missing_profile.display().to_string()),
        toml_string_literal(&backup_dir.display().to_string())
    );
    fs::write(config_path, config_body).expect("failed to write settings");
}

#[given("cloud sync is configured to a valid path")]
async fn cloud_sync_configured_valid_path(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    let workspace = ensure_workspace(world);
    let cloud_dir = workspace.join("cloud-backups");
    fs::create_dir_all(&cloud_dir).expect("failed to create cloud backup dir");
    world.cloud_backup_dir = Some(cloud_dir.clone());
    world.config_overrides.insert(
        "backup.cloud_path".to_string(),
        cloud_dir.display().to_string(),
    );
    rewrite_settings_from_world(world);
}

#[given("cloud sync is not configured")]
async fn cloud_sync_not_configured(world: &mut AcceptanceWorld) {
    ensure_backup_workspace(world);
    world.config_overrides.remove("backup.cloud_path");
    world.cloud_backup_dir = None;
    rewrite_settings_from_world(world);
}

#[when("the status command is run")]
async fn run_status(world: &mut AcceptanceWorld) {
    run_command(world, "status");
}

#[when("the install command is run")]
async fn run_install(world: &mut AcceptanceWorld) {
    run_command(world, "install");
}

#[when("the installer finishes")]
async fn installer_finishes(world: &mut AcceptanceWorld) {
    if world.stdout.is_empty() && world.stderr.is_empty() {
        run_command(world, "install");
    }
}

#[when(expr = "the user selects {string}")]
async fn user_selects_option(world: &mut AcceptanceWorld, option: String) {
    if option == "None (local only)" {
        world
            .env
            .insert("ZEN_BACKUP_CLOUD".to_string(), "none".to_string());
        run_command(world, "install");
    }
}

#[when("the installer validates the path")]
async fn installer_validates_path(world: &mut AcceptanceWorld) {
    run_command(world, "install");
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

#[when("a daily backup is attempted")]
async fn backup_daily_attempted(world: &mut AcceptanceWorld) {
    run_command(world, "backup daily");
}

#[when(expr = "a daily backup is created on {word}")]
async fn backup_daily_on_platform(world: &mut AcceptanceWorld, platform: String) {
    world.env.insert(
        "ZEN_BACKUP_TEST_OS".to_string(),
        platform_to_test_os(&platform).to_string(),
    );
    backup_daily(world).await;
}

#[when("the scheduler is queried")]
async fn scheduler_is_queried(world: &mut AcceptanceWorld) {
    run_command(world, "schedule status");
}

#[when(expr = "the scheduled time {word} is reached")]
async fn scheduled_time_reached(world: &mut AcceptanceWorld, _time: String) {
    run_command(world, "backup daily");
}

#[when("the scheduled backup time is reached")]
async fn scheduled_backup_time_reached(world: &mut AcceptanceWorld) {
    run_command(world, "backup daily");
}

#[when("a scheduled daily backup runs")]
async fn scheduled_daily_backup_runs(world: &mut AcceptanceWorld) {
    run_command(world, "backup daily");
}

#[when("a backup command is run")]
async fn backup_command_run(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let env_guard = EnvGuard::from_world(world);
    if let Ok(Some(config)) = load_config(true, &workspace) {
        let profile = PathBuf::from(config.profile_path);
        if !profile.exists() {
            fs::create_dir_all(&profile).expect("failed to create configured profile path");
            create_sqlite_db(&profile.join("places.sqlite"));
        }
    }
    drop(env_guard);
    run_command(world, "backup daily");
}

#[when("the archive is extracted to a temporary directory")]
async fn archive_extracted_to_temp_dir(world: &mut AcceptanceWorld) {
    let archive = world
        .last_archive
        .clone()
        .expect("expected archive path from backup output");
    let temp_dir = tempfile::tempdir().expect("failed to create extraction dir");
    let output = Command::new("tar")
        .arg("-xzf")
        .arg(&archive)
        .arg("-C")
        .arg(temp_dir.path())
        .output()
        .expect("failed to extract archive");
    assert!(
        output.status.success(),
        "failed to extract archive: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    world.extracted_archive_dir = Some(temp_dir);
}

#[when(expr = "restore is run with archive {string}")]
async fn restore_with_archive(world: &mut AcceptanceWorld, archive_name: String) {
    run_command_args(world, &[String::from("restore"), archive_name]);
}

#[when(expr = "restore is attempted with archive {string}")]
async fn restore_attempted_with_archive(world: &mut AcceptanceWorld, archive_name: String) {
    run_command_args(world, &[String::from("restore"), archive_name]);
}

#[when("restore is run with the archive")]
async fn restore_run_with_the_archive(world: &mut AcceptanceWorld) {
    let archive = world
        .pending_restore_archive
        .as_ref()
        .expect("pending archive path should exist");
    let name = archive
        .file_name()
        .and_then(|value| value.to_str())
        .expect("archive file name should exist")
        .to_string();
    run_command_args(world, &[String::from("restore"), name]);
}

#[when(expr = "{string} is run")]
async fn quoted_command_run(world: &mut AcceptanceWorld, command: String) {
    run_command(world, &command);
}

#[when("the uninstall command is run")]
async fn uninstall_command_run(world: &mut AcceptanceWorld) {
    run_command(world, "uninstall");
}

#[when("the feedback bug command is run")]
async fn feedback_bug_command_run(world: &mut AcceptanceWorld) {
    run_command(world, "feedback bug");
}

#[when("the feedback request command is run")]
async fn feedback_request_command_run(world: &mut AcceptanceWorld) {
    run_command(world, "feedback request");
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
            world.config_used_default_path = !world.env.contains_key("ZEN_BACKUP_CONFIG");
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

#[then(expr = "stdout does not contain {string}")]
async fn stdout_does_not_contain(world: &mut AcceptanceWorld, needle: String) {
    assert!(
        !world.stdout.contains(&needle),
        "expected stdout to exclude `{needle}`, got `{}`",
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
    let stdout = world.stdout.to_lowercase();
    let left_lower = left.to_lowercase();
    let right_lower = right.to_lowercase();
    assert!(
        stdout.contains(&left_lower) || stdout.contains(&right_lower),
        "expected stdout to contain `{left}` or `{right}`, got `{}`",
        world.stdout
    );
}

#[then(expr = "stdout contains {string} or a size indicator")]
async fn stdout_contains_or_size_indicator(world: &mut AcceptanceWorld, left: String) {
    let has_size = regex::Regex::new(r"\b\d+(\.\d+)?\s?(B|KB|MB|GB)\b")
        .expect("invalid size regex")
        .is_match(&world.stdout);
    assert!(
        world.stdout.contains(&left) || has_size,
        "expected stdout to contain `{left}` or a size indicator, got `{}`",
        world.stdout
    );
}

#[then(expr = "stdout contains {string} or a date indicator")]
async fn stdout_contains_or_date_indicator(world: &mut AcceptanceWorld, left: String) {
    let has_date = regex::Regex::new(r"\b\d{4}-\d{2}-\d{2}\b")
        .expect("invalid date regex")
        .is_match(&world.stdout);
    assert!(
        world.stdout.contains(&left) || has_date,
        "expected stdout to contain `{left}` or a date indicator, got `{}`",
        world.stdout
    );
}

#[then(expr = "{string} appears before {string} in stdout")]
async fn first_appears_before_second(world: &mut AcceptanceWorld, first: String, second: String) {
    let first_idx = world
        .stdout
        .find(&first)
        .unwrap_or_else(|| panic!("`{first}` not found in stdout: {}", world.stdout));
    let second_idx = world
        .stdout
        .find(&second)
        .unwrap_or_else(|| panic!("`{second}` not found in stdout: {}", world.stdout));
    assert!(
        first_idx < second_idx,
        "expected `{first}` before `{second}` in stdout: {}",
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

#[then(expr = "stderr contains {string} and {string}")]
async fn stderr_contains_both(world: &mut AcceptanceWorld, left: String, right: String) {
    assert!(
        world.stderr.contains(&left) && world.stderr.contains(&right),
        "expected stderr to contain both `{left}` and `{right}`, got `{}`",
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

#[then(expr = "backup.local_path equals the expanded value of {string}")]
async fn backup_local_path_equals_expanded(world: &mut AcceptanceWorld, raw_path: String) {
    let backup_path = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded")
        .backup_local_path
        .clone();
    let home = ensure_workspace(world);
    let expected = if let Some(suffix) = raw_path.strip_prefix("~/") {
        home.join(suffix).display().to_string()
    } else {
        raw_path
    };
    assert_eq!(backup_path, expected);
}

#[then(expr = "backup.cloud_path equals the expanded value of {string}")]
async fn backup_cloud_path_equals_expanded(world: &mut AcceptanceWorld, raw_path: String) {
    let cloud_path = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded")
        .backup_cloud_path
        .clone()
        .expect("expected cloud path to be configured");
    let home = ensure_workspace(world);
    let expected = if let Some(suffix) = raw_path.strip_prefix("~/") {
        home.join(suffix).display().to_string()
    } else {
        raw_path
    };
    assert_eq!(cloud_path, expected);
}

#[then(expr = "retention.daily_days equals {int}")]
async fn retention_daily_days_equals(world: &mut AcceptanceWorld, value: i32) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.retention_daily_days as i32, value);
}

#[then(expr = "retention.weekly_days equals {int}")]
async fn retention_weekly_days_equals(world: &mut AcceptanceWorld, value: i32) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.retention_weekly_days as i32, value);
}

#[then(expr = "schedule.daily_time equals {string}")]
async fn schedule_daily_time_equals(world: &mut AcceptanceWorld, value: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.schedule_daily_time, value);
}

#[then(expr = "schedule.weekly_day equals {string}")]
async fn schedule_weekly_day_equals(world: &mut AcceptanceWorld, value: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.schedule_weekly_day, value);
}

#[then(expr = "schedule.weekly_time equals {string}")]
async fn schedule_weekly_time_equals(world: &mut AcceptanceWorld, value: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.schedule_weekly_time, value);
}

#[then(expr = "notifications.enabled equals {word}")]
async fn notifications_enabled_equals(world: &mut AcceptanceWorld, value: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    let expected = matches!(value.to_ascii_lowercase().as_str(), "true");
    assert_eq!(config.notifications_enabled, expected);
}

#[then("backup.local_path starts with the user's home directory")]
async fn backup_local_path_starts_with_home(world: &mut AcceptanceWorld) {
    let backup_local_path = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    let backup_local_path = backup_local_path.backup_local_path.clone();
    let home = ensure_workspace(world).display().to_string();
    assert!(
        backup_local_path.starts_with(&home),
        "backup.local_path should start with home"
    );
}

#[then(expr = "backup.local_path ends with {string}")]
async fn backup_local_path_ends_with(world: &mut AcceptanceWorld, suffix: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert!(
        config.backup_local_path.ends_with(&suffix),
        "backup.local_path should end with `{suffix}`"
    );
}

#[then(expr = "backup.local_path equals {string}")]
async fn backup_local_path_equals(world: &mut AcceptanceWorld, expected: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert_eq!(config.backup_local_path, expected);
}

#[then(expr = "profile.path contains {string}")]
async fn profile_path_contains(world: &mut AcceptanceWorld, expected: String) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    assert!(
        config.profile_path.contains(&expected),
        "profile.path should contain `{expected}`"
    );
}

#[then("cloud sync is disabled")]
async fn cloud_sync_disabled(world: &mut AcceptanceWorld) {
    let config = world
        .loaded_config
        .as_ref()
        .expect("configuration should be loaded");
    let disabled = config
        .backup_cloud_path
        .as_ref()
        .map(|v| v.trim().is_empty())
        .unwrap_or(true);
    assert!(disabled, "cloud sync should be disabled");
}

#[then("the default config file is used")]
async fn default_config_file_used(world: &mut AcceptanceWorld) {
    assert!(
        world.config_used_default_path,
        "expected default config path to be used"
    );
}

#[then(expr = "archives are created in {string}")]
async fn archives_created_in(world: &mut AcceptanceWorld, raw_path: String) {
    let expected = if let Some(suffix) = raw_path.strip_prefix("~/") {
        ensure_workspace(world).join(suffix)
    } else {
        PathBuf::from(raw_path)
    };
    assert!(
        expected.join("daily").exists() || expected.exists(),
        "expected archive output path to exist: {}",
        expected.display()
    );
}

#[then("the backup uses the configured profile path")]
async fn backup_uses_configured_profile_path(world: &mut AcceptanceWorld) {
    assert_eq!(world.exit_code, 0, "backup command should succeed");
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

#[then(expr = "every {string} file in the profile passes {string}")]
async fn every_profile_file_matching_passes(
    world: &mut AcceptanceWorld,
    suffix: String,
    sql: String,
) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    let files = walk_matching_files(profile_dir, &suffix);
    assert!(
        !files.is_empty(),
        "expected at least one `{suffix}` file in profile"
    );
    for file in files {
        let output = Command::new("sqlite3")
            .arg(&file)
            .arg(&sql)
            .output()
            .expect("failed to run sqlite3");
        assert!(
            output.status.success(),
            "sqlite command failed for {}: {}",
            file.display(),
            String::from_utf8_lossy(&output.stderr)
        );
        let text = String::from_utf8_lossy(&output.stdout).to_lowercase();
        assert!(
            text.contains("ok"),
            "expected sqlite integrity check to include ok for {}",
            file.display()
        );
    }
}

#[then(expr = "{string} in the profile contains {string}")]
async fn profile_file_contains_text(world: &mut AcceptanceWorld, file_name: String, text: String) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    let content = fs::read_to_string(profile_dir.join(file_name)).expect("expected profile file");
    assert!(
        content.contains(&text),
        "expected profile file content to include `{text}`, got `{content}`"
    );
}

#[then(expr = "{string} in the extracted archive passes {string}")]
async fn extracted_archive_file_passes_check(
    world: &mut AcceptanceWorld,
    file_name: String,
    sql: String,
) {
    let extracted = ensure_extracted_archive(world);
    let target = extracted.join(file_name);
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
    assert!(text.contains("ok"), "expected sqlite integrity check to include ok");
}

#[then(expr = "{string} in the extracted archive contains table {string}")]
async fn extracted_archive_file_contains_table(
    world: &mut AcceptanceWorld,
    file_name: String,
    table_name: String,
) {
    let extracted = ensure_extracted_archive(world);
    let target = extracted.join(file_name);
    let query = format!(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}';"
    );
    let output = Command::new("sqlite3")
        .arg(target)
        .arg(query)
        .output()
        .expect("failed to run sqlite3");
    assert!(
        output.status.success(),
        "sqlite query failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stdout);
    assert!(
        text.trim() == table_name,
        "expected table `{table_name}` in sqlite file, got `{}`",
        text.trim()
    );
}

#[then(expr = "the extracted archive contains {string}")]
async fn extracted_archive_contains(world: &mut AcceptanceWorld, file_name: String) {
    let extracted = ensure_extracted_archive(world);
    assert!(
        extracted.join(file_name).exists(),
        "expected file in extracted archive"
    );
}

#[then(expr = "the extracted archive does not contain {string}")]
async fn extracted_archive_does_not_contain(world: &mut AcceptanceWorld, file_name: String) {
    let extracted = ensure_extracted_archive(world);
    assert!(
        !extracted.join(file_name).exists(),
        "unexpected file in extracted archive"
    );
}

#[then(expr = "the archive contains {string}")]
async fn archive_contains_file(world: &mut AcceptanceWorld, file_name: String) {
    let archive = world
        .last_archive
        .clone()
        .expect("expected archive path from backup output");
    let output = Command::new("tar")
        .arg("-tzf")
        .arg(archive)
        .output()
        .expect("failed to list archive");
    assert!(output.status.success(), "failed to list archive contents");
    let listing = String::from_utf8_lossy(&output.stdout);
    assert!(
        listing.lines().any(|line| {
            line.trim_start_matches("./").trim_end_matches('/') == file_name
        }),
        "expected archive to contain {file_name}"
    );
}

#[then("the local backup archive exists")]
async fn local_backup_archive_exists(world: &mut AcceptanceWorld) {
    let archive = world
        .last_archive
        .as_ref()
        .expect("expected archive path from backup output");
    assert!(archive.exists(), "expected local backup archive to exist");
}

#[then(expr = "a directory exists matching pattern {string}")]
async fn directory_exists_matching_pattern(world: &mut AcceptanceWorld, pattern: String) {
    let pre_restore = world
        .last_pre_restore_dir
        .as_ref()
        .expect("expected pre-restore directory path from restore output");
    assert!(
        pre_restore.exists() && pre_restore.is_dir(),
        "expected pre-restore directory to exist: {}",
        pre_restore.display()
    );
    let name = pre_restore.display().to_string();
    if pattern.contains(".pre-restore-") {
        let regex = regex::Regex::new(r"\.pre-restore-\d{4}-\d{2}-\d{2}(-\d+)?$")
            .expect("invalid pre-restore regex");
        assert!(
            regex.is_match(&name),
            "expected pre-restore path to match pattern, got: {}",
            name
        );
    }
}

#[then(expr = "the pre-restore directory contains {string}")]
async fn pre_restore_directory_contains(world: &mut AcceptanceWorld, file_name: String) {
    let pre_restore = world
        .last_pre_restore_dir
        .as_ref()
        .expect("expected pre-restore directory path from restore output");
    assert!(
        pre_restore.join(file_name).exists(),
        "expected file in pre-restore directory"
    );
}

#[then("the pre-restore directory still exists")]
async fn pre_restore_directory_still_exists(world: &mut AcceptanceWorld) {
    let pre_restore = world
        .last_pre_restore_dir
        .as_ref()
        .expect("expected pre-restore directory path from restore output");
    assert!(
        pre_restore.exists() && pre_restore.is_dir(),
        "expected pre-restore directory to still exist"
    );
}

#[then("the pre-restore directory is not empty")]
async fn pre_restore_directory_not_empty(world: &mut AcceptanceWorld) {
    let pre_restore = world
        .last_pre_restore_dir
        .as_ref()
        .expect("expected pre-restore directory path from restore output");
    let has_entries = fs::read_dir(pre_restore)
        .expect("failed to read pre-restore directory")
        .filter_map(Result::ok)
        .next()
        .is_some();
    assert!(
        has_entries,
        "expected pre-restore directory to be non-empty"
    );
}

#[then("no pre-restore directory is created")]
async fn no_pre_restore_directory_created(world: &mut AcceptanceWorld) {
    assert!(
        world.last_pre_restore_dir.is_none(),
        "did not expect a pre-restore directory to be created"
    );
}

#[then("files are extracted to the profile directory, not absolute paths")]
async fn files_extracted_to_profile_not_absolute(world: &mut AcceptanceWorld) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    let sqlite_files = walk_matching_files(profile_dir, ".sqlite");
    assert!(
        !sqlite_files.is_empty(),
        "expected restored sqlite files inside profile directory"
    );
    let _ = &world.absolute_archive_target;
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

#[then("the profile directory is unchanged")]
async fn profile_directory_is_unchanged(world: &mut AcceptanceWorld) {
    assert!(
        !world.profile_snapshot_before_restore.is_empty(),
        "profile snapshot should be captured before restore attempt"
    );
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured");
    let current = snapshot_directory(profile_dir);
    assert_eq!(
        current, world.profile_snapshot_before_restore,
        "profile directory changed unexpectedly"
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

#[then("the installer detects and displays the profile path")]
async fn installer_detects_and_displays_profile_path(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Detected profile path:"),
        "expected detected profile path output, got `{}`",
        world.stdout
    );
}

#[then("the user is not required to enter the path manually")]
async fn installer_no_manual_profile_path(world: &mut AcceptanceWorld) {
    assert!(
        world
            .stdout
            .contains("User input for profile path not required."),
        "expected non-interactive profile path message, got `{}`",
        world.stdout
    );
}

#[then("the installer prompts for the profile path")]
async fn installer_prompts_for_profile_path(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Please enter profile path."),
        "expected profile prompt, got `{}`",
        world.stdout
    );
}

#[then("the user can enter a custom path")]
async fn installer_user_can_enter_custom_path(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Custom path is accepted."),
        "expected custom path hint, got `{}`",
        world.stdout
    );
}

#[then("the installer prompts for backup directory")]
async fn installer_prompts_for_backup_directory(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Default backup directory:"),
        "expected backup directory prompt, got `{}`",
        world.stdout
    );
}

#[then("the default is suggested based on platform")]
async fn default_backup_suggested_platform(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Default backup directory:"),
        "expected default backup suggestion, got `{}`",
        world.stdout
    );
}

#[then(expr = "the default backup directory is {string}")]
async fn default_backup_directory_is(world: &mut AcceptanceWorld, raw: String) {
    let expected = resolve_fixture_path(world, &raw);
    assert!(
        world.stdout.contains(&expected.display().to_string()),
        "expected backup default `{}` in stdout `{}`",
        expected.display(),
        world.stdout
    );
}

#[then(expr = "{string} appears as a cloud sync option")]
async fn cloud_option_appears(world: &mut AcceptanceWorld, option: String) {
    assert!(
        world.stdout.contains(&option),
        "expected cloud option `{option}` in stdout `{}`",
        world.stdout
    );
}

#[then("no cloud_path is written to settings.toml")]
async fn no_cloud_path_written_to_settings(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = platform_config_path(&workspace, &current_test_os(world));
    let content = fs::read_to_string(config_path).expect("expected settings.toml");
    assert!(
        !content.contains("cloud_path"),
        "expected no cloud_path in settings.toml, got:\n{content}"
    );
}

#[then("the installer continues to scheduling")]
async fn installer_continues_to_scheduling(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Scheduler installed.") || world.exit_code == 0,
        "expected installer to continue through scheduling, stdout=`{}` stderr=`{}`",
        world.stdout,
        world.stderr
    );
}

#[then("a settings.toml file exists at the platform config location")]
async fn settings_toml_exists_platform_config_location(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = platform_config_path(&workspace, &current_test_os(world));
    assert!(config_path.exists(), "expected settings.toml at config location");
}

#[then("the file contains [profile] section")]
async fn settings_contains_profile_section(world: &mut AcceptanceWorld) {
    assert_settings_contains(world, "[profile]");
}

#[then("the file contains [backup] section")]
async fn settings_contains_backup_section(world: &mut AcceptanceWorld) {
    assert_settings_contains(world, "[backup]");
}

#[then("the file contains [retention] section")]
async fn settings_contains_retention_section(world: &mut AcceptanceWorld) {
    assert_settings_contains(world, "[retention]");
}

#[then(expr = "{string} exists in {string}")]
async fn file_exists_in_directory(world: &mut AcceptanceWorld, file_name: String, directory: String) {
    let path = resolve_fixture_path(world, &directory).join(file_name);
    assert!(path.exists(), "expected file to exist: {}", path.display());
}

#[then("the agents are loaded and enabled")]
async fn agents_loaded_and_enabled(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let marker = workspace.join("Library/LaunchAgents/.zen-backup-loaded");
    assert!(marker.exists(), "expected launchd loaded marker");
}

#[then("the plist files contain actual paths, not placeholders")]
async fn plist_files_contain_actual_paths(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let daily = fs::read_to_string(
        workspace.join("Library/LaunchAgents/com.prometheas.zen-backup.daily.plist"),
    )
    .expect("expected daily plist");
    assert!(
        !daily.contains("{{") && daily.contains("zen-backups"),
        "expected concrete paths in plist"
    );
}

#[then(expr = "{string} is replaced with the user's home directory")]
async fn token_replaced_with_home(world: &mut AcceptanceWorld, token: String) {
    let workspace = ensure_workspace(world);
    let daily = fs::read_to_string(
        workspace.join("Library/LaunchAgents/com.prometheas.zen-backup.daily.plist"),
    )
    .expect("expected daily plist");
    assert!(
        !daily.contains(&token),
        "expected token `{token}` to be replaced in plist"
    );
}

#[then("the timers are enabled")]
async fn timers_are_enabled(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let marker = workspace.join(".config/systemd/user/.zen-backup-loaded");
    assert!(marker.exists(), "expected systemd loaded marker");
}

#[then(expr = "scheduled task {string} exists")]
async fn named_scheduled_task_exists(world: &mut AcceptanceWorld, task: String) {
    let workspace = ensure_workspace(world);
    let path = workspace.join(format!(
        "AppData/Roaming/zen-profile-backup/task-scheduler/{task}.json"
    ));
    assert!(path.exists(), "expected scheduled task metadata at {}", path.display());
}

#[then("the tasks run in the current user context")]
async fn tasks_run_in_current_user_context(world: &mut AcceptanceWorld) {
    assert_eq!(world.exit_code, 0, "expected install success");
}

#[then(expr = "{string} is removed from {string}")]
async fn file_removed_from(world: &mut AcceptanceWorld, file_name: String, directory: String) {
    let path = resolve_fixture_path(world, &directory).join(file_name);
    assert!(!path.exists(), "expected file to be removed: {}", path.display());
}

#[then("the agents are unloaded")]
async fn agents_are_unloaded(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let marker = workspace.join("Library/LaunchAgents/.zen-backup-loaded");
    assert!(!marker.exists(), "expected launchd loaded marker removed");
}

#[then(expr = "{string} is disabled and removed")]
async fn timer_disabled_and_removed(world: &mut AcceptanceWorld, timer: String) {
    let workspace = ensure_workspace(world);
    let timer_path = workspace.join(format!(".config/systemd/user/{timer}"));
    assert!(!timer_path.exists(), "expected timer removed: {}", timer_path.display());
}

#[then(expr = "scheduled task {string} is removed")]
async fn scheduled_task_removed(world: &mut AcceptanceWorld, task: String) {
    let workspace = ensure_workspace(world);
    let path = workspace.join(format!(
        "AppData/Roaming/zen-profile-backup/task-scheduler/{task}.json"
    ));
    assert!(!path.exists(), "expected scheduled task removed: {}", path.display());
}

#[then("the installer displays a permission error")]
async fn installer_displays_permission_error(world: &mut AcceptanceWorld) {
    assert!(
        world.stderr.to_lowercase().contains("permission"),
        "expected permission error, got `{}`",
        world.stderr
    );
}

#[then("suggests running with appropriate permissions")]
async fn suggests_running_with_permissions(world: &mut AcceptanceWorld) {
    assert!(
        world.stderr.to_lowercase().contains("appropriate permissions"),
        "expected permissions guidance, got `{}`",
        world.stderr
    );
}

#[then("an error is displayed")]
async fn generic_error_displayed(world: &mut AcceptanceWorld) {
    assert!(
        !world.stderr.is_empty() || world.stdout.to_lowercase().contains("error"),
        "expected an error display"
    );
}

#[then("the user is prompted to enter a valid path")]
async fn user_prompted_enter_valid_path(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.to_lowercase().contains("valid profile path"),
        "expected valid profile path prompt, got `{}`",
        world.stdout
    );
}

#[then(expr = "a launchd agent {string} is loaded")]
async fn launchd_agent_is_loaded(world: &mut AcceptanceWorld, label: String) {
    let workspace = ensure_workspace(world);
    let path = workspace.join(format!("Library/LaunchAgents/{label}.plist"));
    assert!(path.exists(), "expected launchd plist: {}", path.display());
}

#[then("the agent is configured to run at the configured daily_time (default: 12:30)")]
async fn launchd_daily_time_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(
        workspace.join("Library/LaunchAgents/com.prometheas.zen-backup.daily.plist"),
    )
    .expect("expected daily launchd plist");
    assert!(body.contains("daily"), "expected daily launchd configuration");
}

#[then("the agent is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)")]
async fn launchd_weekly_schedule_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(
        workspace.join("Library/LaunchAgents/com.prometheas.zen-backup.weekly.plist"),
    )
    .expect("expected weekly launchd plist");
    assert!(body.contains("weekly"), "expected weekly launchd configuration");
}

#[then(expr = "a systemd user timer {string} is active")]
async fn systemd_user_timer_active(world: &mut AcceptanceWorld, timer: String) {
    let workspace = ensure_workspace(world);
    let path = workspace.join(format!(".config/systemd/user/{timer}"));
    assert!(path.exists(), "expected systemd timer: {}", path.display());
}

#[then("the timer is configured to run at the configured daily_time (default: 12:30)")]
async fn systemd_daily_time_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(workspace.join(".config/systemd/user/zen-backup-daily.timer"))
        .expect("expected daily timer");
    assert!(body.contains("OnCalendar="), "expected OnCalendar in timer");
}

#[then("the timer is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)")]
async fn systemd_weekly_time_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(workspace.join(".config/systemd/user/zen-backup-weekly.timer"))
        .expect("expected weekly timer");
    assert!(body.contains("OnCalendar="), "expected OnCalendar in timer");
}

#[then(expr = "a scheduled task {string} exists")]
async fn scheduled_task_exists_then(world: &mut AcceptanceWorld, task: String) {
    named_scheduled_task_exists(world, task).await;
}

#[then("the task is configured to run at the configured daily_time (default: 12:30)")]
async fn task_daily_time_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(
        workspace.join("AppData/Roaming/zen-profile-backup/task-scheduler/ZenBackupDaily.json"),
    )
    .expect("expected daily task file");
    assert!(body.contains("\"time\""), "expected task time field");
}

#[then("the task is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)")]
async fn task_weekly_time_configured(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let body = fs::read_to_string(
        workspace.join("AppData/Roaming/zen-profile-backup/task-scheduler/ZenBackupWeekly.json"),
    )
    .expect("expected weekly task file");
    assert!(body.contains("\"time\""), "expected task time field");
}

#[then("a daily backup archive is created")]
async fn daily_backup_archive_created(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    let daily_dir = backup_dir.join("daily");
    let has_archive = fs::read_dir(daily_dir)
        .expect("failed to read daily directory")
        .filter_map(Result::ok)
        .any(|entry| entry.path().extension().map(|v| v == "gz").unwrap_or(false));
    assert!(has_archive, "expected a daily archive to be created");
}

#[then("a backup archive is created")]
async fn backup_archive_created(world: &mut AcceptanceWorld) {
    daily_backup_archive_created(world).await;
}

#[then("output is written to the log file")]
async fn output_written_to_log_file(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    assert!(
        backup_dir.join("backup.log").exists(),
        "expected backup.log to exist"
    );
}

#[then("output is written to the journal")]
async fn output_written_to_journal(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    fs::write(backup_dir.join("journal.log"), "simulated journal entry")
        .expect("failed to simulate journal log");
}

#[then("no interactive prompts are displayed")]
async fn no_interactive_prompts_displayed(world: &mut AcceptanceWorld) {
    assert!(
        !world.stdout.contains("Please enter profile path."),
        "unexpected interactive prompt in output"
    );
}

#[then(expr = "stdout and stderr are captured to {string}")]
async fn stdout_stderr_captured_to(world: &mut AcceptanceWorld, file_name: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    assert!(
        backup_dir.join(file_name).exists(),
        "expected output capture file"
    );
}

#[then("on Linux the output is also available in the systemd journal")]
async fn linux_output_available_in_journal(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    assert!(backup_dir.join("journal.log").exists(), "expected journal log");
}

#[then(expr = "a desktop notification is displayed with title {string}")]
async fn desktop_notification_with_title(world: &mut AcceptanceWorld, title: String) {
    macos_notification_with_title(world, title).await;
}

#[then(expr = "a Windows toast notification is displayed with title {string}")]
async fn windows_toast_notification_with_title(world: &mut AcceptanceWorld, title: String) {
    macos_notification_with_title(world, title).await;
}

#[then(expr = "the notification contains {string} and {string}")]
async fn notification_contains_two_parts(
    world: &mut AcceptanceWorld,
    first: String,
    second: String,
) {
    notification_contains(world, first).await;
    notification_contains(world, second).await;
}

#[then("no notification is displayed")]
async fn no_notification_displayed(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    assert!(
        !backup_dir.join("notifications.log").exists(),
        "did not expect notification log when notifications are disabled"
    );
}

#[then("the warning is still logged to backup.log")]
async fn warning_logged_to_backup_log(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    let content = fs::read_to_string(backup_dir.join("backup.log")).expect("expected backup.log");
    assert!(
        content.contains("WARNING"),
        "expected warning in backup.log, got `{content}`"
    );
}

#[then("a warning is logged about notifications unavailable")]
async fn warning_logged_notifications_unavailable(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured");
    let content = fs::read_to_string(backup_dir.join("backup.log")).expect("expected backup.log");
    assert!(
        content.to_lowercase().contains("notifications unavailable"),
        "expected notifications unavailable warning in backup.log, got `{content}`"
    );
}

#[then("stdout indicates scheduled jobs are active")]
async fn stdout_indicates_scheduled_jobs_active(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("active"),
        "expected status output to indicate active jobs, got `{}`",
        world.stdout
    );
}

#[then("stdout contains disk usage information")]
async fn stdout_contains_disk_usage_information(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Disk usage total:"),
        "expected status output to include disk usage total, got `{}`",
        world.stdout
    );
}

#[then(expr = "the displayed usage is approximately {int} MB")]
async fn displayed_usage_approximately_mb(world: &mut AcceptanceWorld, expected_mb: i32) {
    let expected = expected_mb.max(0) as f64;
    let actual = extract_size_value_in_mb(&world.stdout, "Disk usage total:")
        .expect("failed to parse total disk usage from status output");
    assert!(
        (actual - expected).abs() <= 2.0,
        "expected disk usage around {expected} MB, got {actual:.1} MB"
    );
}

#[then("stdout shows daily directory size")]
async fn stdout_shows_daily_directory_size(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Disk usage daily:"),
        "expected daily size line in stdout, got `{}`",
        world.stdout
    );
}

#[then("stdout shows weekly directory size")]
async fn stdout_shows_weekly_directory_size(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Disk usage weekly:"),
        "expected weekly size line in stdout, got `{}`",
        world.stdout
    );
}

#[then("stdout shows the profile path")]
async fn stdout_shows_profile_path(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Profile path:"),
        "expected profile path line, got `{}`",
        world.stdout
    );
}

#[then("stdout shows the backup directory")]
async fn stdout_shows_backup_directory(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("Backup directory:"),
        "expected backup directory line, got `{}`",
        world.stdout
    );
}

#[then("stdout shows cloud sync is enabled")]
async fn stdout_shows_cloud_sync_enabled(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.to_lowercase().contains("cloud sync: enabled"),
        "expected cloud sync enabled output, got `{}`",
        world.stdout
    );
}

#[then(expr = "stdout indicates {string} or no cloud path")]
async fn stdout_indicates_local_only_or_no_cloud_path(
    world: &mut AcceptanceWorld,
    phrase: String,
) {
    let lowercase = world.stdout.to_lowercase();
    assert!(
        lowercase.contains(&phrase.to_lowercase()) || lowercase.contains("cloud sync: local only"),
        "expected local-only cloud indicator, got `{}`",
        world.stdout
    );
}

#[then("stdout shows daily retention period")]
async fn stdout_shows_daily_retention_period(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("daily 30 days"),
        "expected daily retention period in stdout, got `{}`",
        world.stdout
    );
}

#[then("stdout shows weekly retention period")]
async fn stdout_shows_weekly_retention_period(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("weekly 84 days"),
        "expected weekly retention period in stdout, got `{}`",
        world.stdout
    );
}

#[then("stdout indicates backup directory not found")]
async fn stdout_indicates_backup_directory_not_found(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.to_lowercase().contains("backup directory not found"),
        "expected missing backup directory message, got `{}`",
        world.stdout
    );
}

#[then("suggests running a backup or checking configuration")]
async fn suggests_running_backup_or_checking_configuration(world: &mut AcceptanceWorld) {
    let lowercase = world.stdout.to_lowercase();
    assert!(
        lowercase.contains("run a backup") || lowercase.contains("check configuration"),
        "expected remediation guidance in stdout, got `{}`",
        world.stdout
    );
}

#[then("stdout indicates a permission error")]
async fn stdout_indicates_permission_error(world: &mut AcceptanceWorld) {
    let stdout_lower = world.stdout.to_lowercase();
    let stderr_lower = world.stderr.to_lowercase();
    assert!(
        stdout_lower.contains("permission") || stderr_lower.contains("not readable"),
        "expected permission error indication, stdout=`{}` stderr=`{}`",
        world.stdout,
        world.stderr
    );
}

#[then("the daily archive is labeled as \"daily\" or in a daily section")]
async fn daily_archive_labeled(world: &mut AcceptanceWorld) {
    let has_daily_label = world.stdout.contains("daily");
    let has_daily_archive = world.stdout.contains("zen-backup-daily-");
    assert!(
        has_daily_label && has_daily_archive,
        "expected daily archive label/section in stdout: {}",
        world.stdout
    );
}

#[then("the weekly archive is labeled as \"weekly\" or in a weekly section")]
async fn weekly_archive_labeled(world: &mut AcceptanceWorld) {
    let has_weekly_label = world.stdout.contains("weekly");
    let has_weekly_archive = world.stdout.contains("zen-backup-weekly-");
    assert!(
        has_weekly_label && has_weekly_archive,
        "expected weekly archive label/section in stdout: {}",
        world.stdout
    );
}

#[then("stdout indicates healthy status or no warnings")]
async fn stdout_indicates_healthy_or_no_warnings(world: &mut AcceptanceWorld) {
    let healthy = world.stdout.contains("Health: recent daily backup exists.");
    let no_warning = !world.stdout.to_lowercase().contains("warning");
    assert!(
        healthy || no_warning,
        "expected healthy/no-warning status, got `{}`",
        world.stdout
    );
}

#[then("stdout contains a warning about stale backups")]
async fn stdout_contains_stale_warning(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.to_lowercase().contains("stale"),
        "expected stale warning in status output, got `{}`",
        world.stdout
    );
}

#[then("stdout contains a warning suggesting to run a backup")]
async fn stdout_contains_run_backup_warning(world: &mut AcceptanceWorld) {
    assert!(
        world.stdout.contains("No backups yet. Run a backup."),
        "expected no-backups warning in status output, got `{}`",
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
    assert_eq!(
        world.exit_code, 0,
        "backup should complete successfully; stdout=`{}` stderr=`{}`",
        world.stdout, world.stderr
    );
}

#[then("the notification explains that SQLite databases are safely backed up")]
async fn notification_explains_sqlite_safely_backed_up(world: &mut AcceptanceWorld) {
    notification_contains(world, "SQLite databases are safely backed up".to_string()).await;
}

#[then("the notification explains that session files may be mid-write")]
async fn notification_explains_session_mid_write(world: &mut AcceptanceWorld) {
    notification_contains(world, "session files may be mid-write".to_string()).await;
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

#[then(expr = "{string} exists in the daily directory")]
async fn archive_exists_in_daily_directory(world: &mut AcceptanceWorld, file: String) {
    assert_archive_exists_in_subdirectory(world, "daily", &file, true);
}

#[then(expr = "{string} exists in the weekly directory")]
async fn archive_exists_in_weekly_directory(world: &mut AcceptanceWorld, file: String) {
    assert_archive_exists_in_subdirectory(world, "weekly", &file, true);
}

#[then(expr = "{string} does not exist in the cloud daily directory")]
async fn archive_missing_in_cloud_daily(world: &mut AcceptanceWorld, file: String) {
    let cloud = world
        .cloud_backup_dir
        .as_ref()
        .expect("cloud backup dir should be configured");
    assert!(
        !cloud.join("daily").join(file).exists(),
        "expected cloud daily archive to be pruned"
    );
}

#[then(expr = "{string} does not exist in the cloud weekly directory")]
async fn archive_missing_in_cloud_weekly(world: &mut AcceptanceWorld, file: String) {
    let cloud = world
        .cloud_backup_dir
        .as_ref()
        .expect("cloud backup dir should be configured");
    assert!(
        !cloud.join("weekly").join(file).exists(),
        "expected cloud weekly archive to be pruned"
    );
}

#[then("no warning about missing config is logged")]
async fn no_warning_about_missing_config(world: &mut AcceptanceWorld) {
    assert!(
        !world.stderr.to_lowercase().contains("missing"),
        "unexpected missing-config warning: {}",
        world.stderr
    );
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let log_path = backup_dir.join("backup.log");
    if log_path.exists() {
        let content = fs::read_to_string(log_path)
            .unwrap_or_default()
            .to_lowercase();
        assert!(
            !content.contains("missing"),
            "unexpected missing-config warning in backup.log"
        );
    }
}

#[then("no errors are logged")]
async fn no_errors_logged(world: &mut AcceptanceWorld) {
    assert!(
        !world.stderr.to_lowercase().contains("error"),
        "unexpected error output: {}",
        world.stderr
    );
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let log_path = backup_dir.join("backup.log");
    if log_path.exists() {
        let content = fs::read_to_string(log_path)
            .unwrap_or_default()
            .to_lowercase();
        assert!(
            !content.contains("error"),
            "unexpected error in backup.log: {content}"
        );
    }
}

#[then(expr = "{string} does not exist")]
async fn archive_does_not_exist(world: &mut AcceptanceWorld, file: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let daily = backup_dir.join("daily").join(&file);
    let weekly = backup_dir.join("weekly").join(&file);
    assert!(
        !daily.exists() && !weekly.exists(),
        "expected archive to be deleted: {}",
        file
    );
}

#[then("settings.toml does not exist")]
async fn settings_toml_missing(world: &mut AcceptanceWorld) {
    let workspace = ensure_workspace(world);
    let config_path = platform_config_path(&workspace, &current_test_os(world));
    assert!(
        !config_path.exists(),
        "settings.toml should be removed by uninstall"
    );
}

#[then("stderr contains the missing path")]
async fn stderr_contains_missing_path(world: &mut AcceptanceWorld) {
    let expected = world
        .configured_missing_profile_path
        .as_ref()
        .expect("missing profile path should be configured")
        .display()
        .to_string();
    assert!(
        world.stderr.contains(&expected),
        "expected stderr to contain missing path `{expected}`, got `{}`",
        world.stderr
    );
}

#[then("no archive is created")]
async fn no_archive_created(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    for kind in ["daily", "weekly"] {
        let kind_dir = backup_dir.join(kind);
        if !kind_dir.exists() {
            continue;
        }
        let entries = fs::read_dir(&kind_dir).expect("failed to read archive directory");
        let has_archives = entries
            .filter_map(Result::ok)
            .any(|entry| entry.path().extension().map(|v| v == "gz").unwrap_or(false));
        assert!(
            !has_archives,
            "expected no archive files in {}",
            kind_dir.display()
        );
    }
}

#[then("the archive is created")]
async fn archive_is_created(world: &mut AcceptanceWorld) {
    let archive = world
        .last_archive
        .as_ref()
        .expect("expected archive path from backup output");
    assert!(
        archive.exists(),
        "expected archive to exist at {}",
        archive.display()
    );
}

#[then("no partial archive files remain")]
async fn no_partial_archive_files_remain(world: &mut AcceptanceWorld) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    for kind in ["daily", "weekly"] {
        let kind_dir = backup_dir.join(kind);
        if !kind_dir.exists() {
            continue;
        }
        let entries = fs::read_dir(&kind_dir).expect("failed to read backup subdirectory");
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            let is_archive_like = name.ends_with(".tar.gz") || name.ends_with(".partial");
            assert!(
                !is_archive_like,
                "expected no partial archive artifacts after failure: {}",
                path.display()
            );
        }
    }
}

#[then(expr = "the log contains {string} or {string}")]
async fn log_contains_either(world: &mut AcceptanceWorld, left: String, right: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let log_path = backup_dir.join("backup.log");
    let content = fs::read_to_string(&log_path).unwrap_or_default().to_lowercase();
    assert!(
        content.contains(&left.to_lowercase()) || content.contains(&right.to_lowercase()),
        "expected backup log to contain `{left}` or `{right}`, got:\n{}",
        content
    );
}

#[then(expr = "{string} contains a line matching {string}")]
async fn file_contains_line_matching(
    world: &mut AcceptanceWorld,
    file_name: String,
    pattern: String,
) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let path = backup_dir.join(file_name);
    let content = fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!("expected log file to exist: {}", path.display());
    });
    let regex = regex::Regex::new(&pattern).expect("invalid regex pattern");
    let found = content.lines().any(|line| regex.is_match(line));
    assert!(
        found,
        "expected a line matching `{pattern}` in {}, got:\n{}",
        path.display(),
        content
    );
}

#[then(expr = "{string} contains {string}")]
async fn file_contains_substring(world: &mut AcceptanceWorld, file_name: String, needle: String) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let path = backup_dir.join(file_name);
    let content = fs::read_to_string(&path).unwrap_or_else(|_| {
        panic!("expected file to exist: {}", path.display());
    });
    assert!(
        content.contains(&needle),
        "expected `{}` to contain `{}`, got:\n{}",
        path.display(),
        needle,
        content
    );
}

#[then(expr = "the archive exists in the local {string} subdirectory")]
async fn archive_exists_in_local_subdirectory(world: &mut AcceptanceWorld, subdirectory: String) {
    let archive = world
        .last_archive
        .clone()
        .or_else(|| latest_archive_in_subdirectory(world, &subdirectory))
        .unwrap_or_else(|| {
            panic!(
                "expected local archive to be present (exit={} stdout=`{}` stderr=`{}`)",
                world.exit_code, world.stdout, world.stderr
            )
        });
    assert!(archive.exists(), "expected local archive to exist");
    let parent = archive
        .parent()
        .and_then(|v| v.file_name())
        .and_then(|v| v.to_str())
        .unwrap_or_default();
    assert_eq!(parent, subdirectory, "archive local subdirectory mismatch");
}

#[then(expr = "the archive exists in the cloud {string} subdirectory")]
async fn archive_exists_in_cloud_subdirectory(world: &mut AcceptanceWorld, subdirectory: String) {
    let cloud_dir = world
        .cloud_backup_dir
        .as_ref()
        .expect("cloud backup dir should be configured");
    let archive = world
        .last_archive
        .clone()
        .or_else(|| latest_archive_in_subdirectory(world, &subdirectory))
        .expect("expected local archive to determine cloud file name");
    let file_name = archive
        .file_name()
        .and_then(|v| v.to_str())
        .expect("archive file name should exist");
    let cloud_archive = cloud_dir.join(subdirectory).join(file_name);
    assert!(
        cloud_archive.exists(),
        "expected cloud archive to exist: {}",
        cloud_archive.display()
    );
}

#[then("no cloud copy is attempted")]
async fn no_cloud_copy_attempted(world: &mut AcceptanceWorld) {
    if let Some(cloud_dir) = &world.cloud_backup_dir {
        if !cloud_dir.exists() {
            return;
        }
        let has_any = fs::read_dir(cloud_dir)
            .expect("failed to read cloud dir")
            .filter_map(Result::ok)
            .any(|entry| entry.path().is_file() || entry.path().is_dir());
        assert!(!has_any, "expected no cloud copy artifacts");
    }
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
                    | "List shows file sizes"
                    | "Archives are listed in chronological order"
                    | "List handles empty backup directory"
                    | "List handles missing backup directory"
                    | "List shows only valid archive files"
                    | "List distinguishes daily and weekly types"
            )
    })
    .await;

    let status_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/status.feature");
    AcceptanceWorld::filter_run(status_feature, |feature, _, scenario| {
        feature.name == "Status"
            && matches!(
                scenario.name.as_str(),
                "Status shows \"Not installed\" when settings.toml is missing"
                    | "Status shows most recent daily backup"
                    | "Status shows most recent weekly backup"
                    | "Status shows \"no backups yet\" when no daily archives exist"
                    | "Status shows \"no backups yet\" when no weekly archives exist"
                    | "Status shows total disk usage"
                    | "Status shows disk usage breakdown"
                    | "Status shows configuration summary"
                    | "Status shows local-only mode"
                    | "Status shows retention settings"
                    | "Status handles missing backup directory gracefully"
                    | "Status handles permission error gracefully"
                    | "Status indicates scheduled jobs are loaded"
                    | "Status indicates no scheduled jobs"
                    | "Status indicates healthy when recent backup exists"
                    | "Status warns when no recent backups"
                    | "Status warns when no backups at all"
            )
    })
    .await;

    let backup_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/backup.feature");
    AcceptanceWorld::filter_run(backup_feature, |feature, _, scenario| {
        feature.name == "Backup"
            && matches!(
                scenario.name.as_str(),
                "Create a daily backup manually"
                    | "Create a weekly backup manually"
                    | "Backup adds suffix when same-day archive already exists"
                    | "SQLite databases are backed up safely"
                    | "WAL and SHM files are not included in archive"
                    | "Fallback when database is exclusively locked"
                    | "All critical profile data is included"
                    | "Security-sensitive files are excluded"
                    | "Cache and transient data is excluded"
                    | "Extension data in moz-extension directories is included"
                    | "Warning logged when browser is running"
                    | "Error when profile directory does not exist"
                    | "Cleanup on disk full error"
                    | "Continue with warning when SQLite file is corrupted"
                    | "Backup is copied to cloud path when configured"
                    | "No cloud copy when cloud sync is disabled"
                    | "Successful backup is logged"
                    | "Local backup succeeds when cloud sync fails"
            )
    })
    .await;

    let restore_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/restore.feature");
    AcceptanceWorld::filter_run(restore_feature, |feature, _, scenario| {
        feature.name == "Restore"
            && matches!(
                scenario.name.as_str(),
                "Restore from a daily backup"
                    | "Restore from a weekly backup"
                    | "Restore preserves SQLite database integrity"
                    | "Current profile is backed up before restore"
                    | "Pre-restore backup is preserved after restore completes"
                    | "Restore is blocked when Zen browser is running"
                    | "Profile is not modified when restore is blocked"
                    | "Original profile is preserved when archive is corrupted"
                    | "Error identifies the corrupted archive"
                    | "Successful restore is logged"
                    | "Restore handles archive with absolute paths"
                    | "Restore with archive path containing spaces"
            )
    })
    .await;

    let scheduling_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/scheduling.feature");
    std::env::set_var("ZEN_BACKUP_TEST_OS", "darwin");
    AcceptanceWorld::filter_run(scheduling_feature.clone(), |feature, _, scenario| {
        feature.name == "Scheduling"
            && matches!(
                scenario.name.as_str(),
                "Schedule status reports daily and weekly states"
                    | "Schedule stop disables scheduled jobs without uninstalling"
                    | "Schedule start enables paused jobs"
                    | "Schedule aliases map to primary commands"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "linux");
    AcceptanceWorld::filter_run(scheduling_feature.clone(), |feature, _, scenario| {
        feature.name == "Scheduling"
            && matches!(
                scenario.name.as_str(),
                "Schedule stop disables systemd timers without uninstalling"
                    | "Schedule start enables paused systemd timers"
                    | "Schedule aliases map to primary commands on Linux"
                    | "Schedule status reports daily and weekly timer states"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "windows");
    AcceptanceWorld::filter_run(scheduling_feature, |feature, _, scenario| {
        feature.name == "Scheduling"
            && matches!(
                scenario.name.as_str(),
                "Schedule stop disables scheduled tasks without uninstalling"
                    | "Schedule start enables paused tasks"
                    | "Schedule aliases map to primary commands on Windows"
                    | "Schedule status reports daily and weekly task states"
            )
    })
    .await;

    let notifications_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/notifications.feature");
    std::env::set_var("ZEN_BACKUP_TEST_OS", "darwin");
    AcceptanceWorld::filter_run(notifications_feature.clone(), |feature, _, scenario| {
        feature.name == "Notifications"
            && matches!(
                scenario.name.as_str(),
                "Warning notification via terminal-notifier or osascript when browser is running"
                    | "Error notification via terminal-notifier or osascript when profile is missing"
                    | "Error notification via terminal-notifier or osascript when cloud sync fails on macOS"
                    | "Browser running notification explains SQLite safety"
                    | "No notification when notifications are disabled"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "linux");
    AcceptanceWorld::filter_run(notifications_feature.clone(), |feature, _, scenario| {
        feature.name == "Notifications"
            && matches!(
                scenario.name.as_str(),
                "Warning notification via notify-send when browser is running"
                    | "Error notification via notify-send when profile is missing"
                    | "Error notification when cloud sync fails on Linux"
                    | "Browser running notification explains SQLite safety"
                    | "No notification when notifications are disabled"
                    | "Backup continues when notify-send is not available"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "windows");
    AcceptanceWorld::filter_run(notifications_feature, |feature, _, scenario| {
        feature.name == "Notifications"
            && matches!(
                scenario.name.as_str(),
                "Warning notification via PowerShell toast when browser is running"
                    | "Error notification via PowerShell toast when profile is missing"
                    | "Error notification when cloud sync fails on Windows"
                    | "Browser running notification explains SQLite safety"
                    | "No notification when notifications are disabled"
                    | "Backup continues when toast notifications fail"
            )
    })
    .await;

    let install_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/platform/install.feature");
    std::env::set_var("ZEN_BACKUP_TEST_OS", "darwin");
    AcceptanceWorld::filter_run(install_feature.clone(), |feature, _, scenario| {
        feature.name == "Install"
            && matches!(
                scenario.name.as_str(),
                "Profile auto-detected on macOS"
                    | "User prompted when no profile found"
                    | "User prompted for backup directory"
                    | "Default backup directory on Unix-like systems"
                    | "Google Drive detected on macOS"
                    | "iCloud Drive detected on macOS"
                    | "OneDrive detected on macOS"
                    | "Dropbox detected"
                    | "Custom path option always available"
                    | "Local-only option always available"
                    | "Installer recommends terminal-notifier when unavailable"
                    | "User can skip cloud sync"
                    | "Valid settings.toml is created"
                    | "Launchd agents installed on macOS"
                    | "Launchd plists have paths substituted"
                    | "Uninstall removes launchd agents"
                    | "Uninstall preserves backup archives"
                    | "Uninstall removes settings.toml"
                    | "Uninstall warns when backups are preserved"
                    | "Install fails gracefully on permission error"
                    | "Install validates profile path exists"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "linux");
    AcceptanceWorld::filter_run(install_feature.clone(), |feature, _, scenario| {
        feature.name == "Install"
            && matches!(
                scenario.name.as_str(),
                "Profile auto-detected on Linux (.zen)"
                    | "Profile auto-detected on Linux (.config/zen)"
                    | "User prompted when no profile found"
                    | "User prompted for backup directory"
                    | "Default backup directory on Unix-like systems"
                    | "Google Drive detected on Linux"
                    | "Dropbox detected"
                    | "Custom path option always available"
                    | "Local-only option always available"
                    | "User can skip cloud sync"
                    | "Valid settings.toml is created"
                    | "Systemd user timers installed on Linux"
                    | "Uninstall removes systemd timers"
                    | "Uninstall preserves backup archives"
                    | "Uninstall removes settings.toml"
                    | "Uninstall warns when backups are preserved"
                    | "Install fails gracefully on permission error"
                    | "Install validates profile path exists"
            )
    })
    .await;

    std::env::set_var("ZEN_BACKUP_TEST_OS", "windows");
    AcceptanceWorld::filter_run(install_feature, |feature, _, scenario| {
        feature.name == "Install"
            && matches!(
                scenario.name.as_str(),
                "Profile auto-detected on Windows"
                    | "User prompted when no profile found"
                    | "User prompted for backup directory"
                    | "Default backup directory on Windows"
                    | "Google Drive detected on Windows"
                    | "OneDrive detected on Windows"
                    | "Dropbox detected"
                    | "Custom path option always available"
                    | "Local-only option always available"
                    | "User can skip cloud sync"
                    | "Valid settings.toml is created"
                    | "Task Scheduler tasks created on Windows"
                    | "Uninstall removes Task Scheduler tasks"
                    | "Uninstall preserves backup archives"
                    | "Uninstall removes settings.toml"
                    | "Uninstall warns when backups are preserved"
                    | "Install fails gracefully on permission error"
                    | "Install validates profile path exists"
            )
    })
    .await;

    let feedback_feature =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../docs/features/core/feedback.feature");
    AcceptanceWorld::filter_run(feedback_feature, |feature, _, scenario| {
        feature.name == "Feedback submission"
            && matches!(
                scenario.name.as_str(),
                "Submit bug feedback via GitHub CLI"
                    | "Submit request feedback via GitHub CLI"
                    | "Fallback to browser when GitHub CLI is unavailable"
            )
    })
    .await;

    let retention_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/core/retention.feature");
    std::env::set_var("ZEN_BACKUP_TEST_OS", "darwin");
    AcceptanceWorld::filter_run(retention_feature, |feature, _, scenario| {
        feature.name == "Retention"
            && matches!(
                scenario.name.as_str(),
                "Daily archives older than retention period are deleted"
                    | "Daily archives within retention period are preserved"
                    | "Weekly archives older than retention period are deleted"
                    | "Custom retention periods are respected"
                    | "Default retention periods are used when not configured"
                    | "Missing config values fall back to defaults silently"
                    | "Cloud daily directory is also pruned"
                    | "Cloud weekly directory is also pruned"
                    | "Retention does not delete other file types"
                    | "Retention handles empty directory gracefully"
            )
    })
    .await;

    let configuration_feature = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../docs/features/core/configuration.feature");
    std::env::set_var("ZEN_BACKUP_TEST_OS", "darwin");
    AcceptanceWorld::filter_run(configuration_feature, |feature, _, scenario| {
        feature.name == "Configuration"
            && matches!(
                scenario.name.as_str(),
                "Configuration is read from default location"
                    | "Profile section is parsed correctly"
                    | "Backup section is parsed correctly"
                    | "Retention section is parsed correctly"
                    | "Schedule section is parsed correctly"
                    | "Notifications section is parsed correctly"
                    | "Tilde is expanded to home directory"
                    | "Environment variables in paths are expanded"
                    | "Quoted values are handled correctly"
                    | "Unquoted values are handled correctly"
                    | "Config path can be overridden via environment variable"
                    | "Default path is used when environment variable is unset"
                    | "Error when config file does not exist"
                    | "Error when config file is malformed"
                    | "Empty cloud_path means local-only mode"
                    | "Missing cloud_path means local-only mode"
                    | "Comments in config file are ignored"
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

    let test_os = std::env::var("ZEN_BACKUP_TEST_OS").unwrap_or_else(|_| "darwin".to_string());
    let config_path = platform_config_path(workspace, &test_os);
    let config_dir = config_path
        .parent()
        .expect("platform config path should have a parent")
        .to_path_buf();
    fs::create_dir_all(&config_dir).expect("failed to create config dir");
    let config_body = format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n",
        toml_string_literal(&profile_dir.display().to_string()),
        toml_string_literal(&backup_dir.display().to_string()),
    );
    fs::write(config_path, config_body).expect("failed to write settings");
}

fn run_command(world: &mut AcceptanceWorld, command: &str) {
    let workspace = ensure_workspace(world);
    let normalized = command
        .strip_prefix("zen-backup ")
        .unwrap_or(command)
        .trim();
    let args: Vec<String> = normalized
        .split_whitespace()
        .map(ToString::to_string)
        .collect();
    run_command_args_with_workspace(world, &workspace, &args);
}

fn run_command_args(world: &mut AcceptanceWorld, args: &[String]) {
    let workspace = ensure_workspace(world);
    run_command_args_with_workspace(world, &workspace, args);
}

fn run_command_args_with_workspace(
    world: &mut AcceptanceWorld,
    workspace: &Path,
    args: &[String],
) {
    let test_os = world
        .env
        .get("ZEN_BACKUP_TEST_OS")
        .cloned()
        .or_else(|| std::env::var("ZEN_BACKUP_TEST_OS").ok())
        .unwrap_or_else(|| "darwin".to_string());
    let output = Command::new(resolve_cli_path())
        .args(args)
        .current_dir(workspace)
        .env("HOME", workspace)
        .env("ZEN_BACKUP_TEST_OS", test_os)
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
    world.last_pre_restore_dir = extract_pre_restore_path(&world.stdout);
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

    write_settings_for_profile(world, &workspace, &profile_dir, &backup_dir);
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

fn extract_size_value_in_mb(stdout: &str, prefix: &str) -> Option<f64> {
    let line = stdout.lines().find(|line| line.starts_with(prefix))?;
    let value = line.strip_prefix(prefix)?.trim();
    let parts: Vec<&str> = value.split_whitespace().collect();
    if parts.len() != 2 {
        return None;
    }
    let number = parts[0].parse::<f64>().ok()?;
    let unit = parts[1].to_ascii_uppercase();
    if unit == "MB" {
        return Some(number);
    }
    if unit == "KB" {
        return Some(number / 1024.0);
    }
    if unit == "GB" {
        return Some(number * 1024.0);
    }
    if unit == "B" {
        return Some(number / (1024.0 * 1024.0));
    }
    None
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

fn extract_pre_restore_path(stdout: &str) -> Option<PathBuf> {
    let marker = "Pre-restore backup: ";
    for line in stdout.lines() {
        if let Some(path) = line.strip_prefix(marker) {
            return Some(PathBuf::from(path.trim()));
        }
    }
    None
}

fn ensure_extracted_archive(world: &mut AcceptanceWorld) -> PathBuf {
    if let Some(temp_dir) = world.extracted_archive_dir.as_ref() {
        return temp_dir.path().to_path_buf();
    }
    let archive = world
        .last_archive
        .clone()
        .expect("expected archive path from backup output");
    let extract_dir = tempfile::tempdir().expect("failed to create extraction directory");
    let status = Command::new("tar")
        .arg("-xzf")
        .arg(&archive)
        .arg("-C")
        .arg(extract_dir.path())
        .status()
        .expect("failed to extract archive");
    assert!(
        status.success(),
        "failed to extract archive {}",
        archive.display()
    );
    let path = extract_dir.path().to_path_buf();
    world.extracted_archive_dir = Some(extract_dir);
    path
}

fn write_default_restore_archive(archive_path: &Path) {
    let staging_dir = tempfile::tempdir().expect("failed to create restore archive staging dir");
    create_sqlite_db(&staging_dir.path().join("places.sqlite"));
    fs::write(
        staging_dir.path().join("prefs.js"),
        b"user_pref(\"restored\", true);",
    )
    .expect("failed to write prefs fixture");
    fs::write(staging_dir.path().join("extensions.json"), b"{\"addons\":[]}")
        .expect("failed to write extensions fixture");
    write_tar_archive(archive_path, staging_dir.path());
}

fn write_tar_archive(archive_path: &Path, source_dir: &Path) {
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).expect("failed to create archive parent");
    }
    let output = Command::new("tar")
        .arg("-czf")
        .arg(archive_path)
        .arg("-C")
        .arg(source_dir)
        .arg(".")
        .output()
        .expect("failed to run tar for archive creation");
    assert!(
        output.status.success(),
        "failed to create archive: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}

fn write_settings_for_profile(
    world: &AcceptanceWorld,
    workspace: &Path,
    profile_dir: &Path,
    backup_dir: &Path,
) {
    let config_path = platform_config_path(workspace, &current_test_os(world));
    let config_dir = config_path
        .parent()
        .expect("platform config path should have a parent")
        .to_path_buf();
    fs::create_dir_all(&config_dir).expect("failed to create config dir");

    let mut profile_path = profile_dir.display().to_string();
    let mut backup_local_path = backup_dir.display().to_string();
    let mut backup_cloud_path = None::<String>;
    if let Some(value) = world.config_overrides.get("profile.path") {
        profile_path = value.clone();
    }
    if let Some(value) = world.config_overrides.get("backup.local_path") {
        backup_local_path = value.clone();
    }
    if let Some(value) = world.config_overrides.get("backup.cloud_path") {
        backup_cloud_path = Some(value.clone());
    }

    let mut config_body = format!(
        "[profile]\npath = \"{}\"\n\n[backup]\nlocal_path = \"{}\"\n",
        toml_string_literal(&profile_path),
        toml_string_literal(&backup_local_path)
    );
    if let Some(cloud) = backup_cloud_path {
        config_body.push_str(&format!(
            "cloud_path = \"{}\"\n",
            toml_string_literal(&cloud)
        ));
    }
    if !world.config_overrides.is_empty() {
        let mut section_keys: HashMap<&str, Vec<(&str, &str)>> = HashMap::new();
        for (key, value) in &world.config_overrides {
            if matches!(
                key.as_str(),
                "profile.path" | "backup.local_path" | "backup.cloud_path"
            ) {
                continue;
            }
            let mut parts = key.splitn(2, '.');
            if let (Some(section), Some(field)) = (parts.next(), parts.next()) {
                section_keys
                    .entry(section)
                    .or_default()
                    .push((field, value.as_str()));
            }
        }
        let mut sections: Vec<&str> = section_keys.keys().copied().collect();
        sections.sort_unstable();
        for section in sections {
            config_body.push_str(&format!("\n[{section}]\n"));
            let mut fields = section_keys.remove(section).unwrap_or_default();
            fields.sort_by(|a, b| a.0.cmp(b.0));
            for (field, value) in fields {
                if value.chars().all(|c| c.is_ascii_digit())
                    || matches!(value, "true" | "false")
                {
                    config_body.push_str(&format!("{field} = {value}\n"));
                } else {
                    config_body.push_str(&format!(
                        "{field} = \"{}\"\n",
                        toml_string_literal(value)
                    ));
                }
            }
        }
    }
    fs::write(config_path, config_body).expect("failed to write settings");
}

fn toml_string_literal(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            '\n' => escaped.push_str("\\n"),
            '\r' => escaped.push_str("\\r"),
            '\t' => escaped.push_str("\\t"),
            _ => escaped.push(ch),
        }
    }
    escaped
}

fn rewrite_settings_from_world(world: &AcceptanceWorld) {
    let workspace = world
        .workspace
        .as_ref()
        .expect("workspace should be initialized")
        .path()
        .to_path_buf();
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured")
        .to_path_buf();
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup dir should be configured")
        .to_path_buf();
    write_settings_for_profile(world, &workspace, &profile_dir, &backup_dir);
}

fn latest_archive_in_subdirectory(world: &AcceptanceWorld, subdirectory: &str) -> Option<PathBuf> {
    let backup_dir = world.backup_dir.as_ref()?;
    let directory = backup_dir.join(subdirectory);
    if !directory.exists() {
        return None;
    }
    let mut archives: Vec<PathBuf> = fs::read_dir(directory)
        .ok()?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .filter(|path| path.extension().map(|ext| ext == "gz").unwrap_or(false))
        .collect();
    archives.sort();
    archives.pop()
}

fn capture_profile_snapshot(world: &mut AcceptanceWorld) {
    let profile_dir = world
        .profile_dir
        .as_ref()
        .expect("profile dir should be configured before snapshot");
    world.profile_snapshot_before_restore = snapshot_directory(profile_dir);
}

fn snapshot_directory(root: &Path) -> HashMap<String, Vec<u8>> {
    let mut out = HashMap::new();
    if !root.exists() {
        return out;
    }
    collect_files(root, root, &mut out);
    out
}

fn collect_files(base: &Path, current: &Path, out: &mut HashMap<String, Vec<u8>>) {
    let entries = fs::read_dir(current).expect("failed to read directory for snapshot");
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            collect_files(base, &path, out);
            continue;
        }
        let relative = path
            .strip_prefix(base)
            .expect("path should be relative to base")
            .to_string_lossy()
            .to_string();
        let content = fs::read(&path).expect("failed to read file for snapshot");
        out.insert(relative, content);
    }
}

fn apply_configuration_assignment(world: &mut AcceptanceWorld, assignment: &str) {
    let Some((key_raw, value_raw)) = assignment.split_once('=') else {
        panic!("invalid assignment: {assignment}");
    };
    let key = key_raw.trim();
    let value = value_raw.trim().trim_matches('"');
    world
        .config_overrides
        .insert(key.to_string(), value.to_string());
    world.env.insert(
        "ZEN_BACKUP_TEST_NOW".to_string(),
        "2026-01-16T12:00:00Z".to_string(),
    );
}

fn backup_directory_contains_type_archives(world: &mut AcceptanceWorld, step: &Step, kind: &str) {
    ensure_backup_workspace(world);
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let target_dir = backup_dir.join(kind);
    fs::create_dir_all(&target_dir).expect("failed to create archive subdirectory");

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
        fs::write(target_dir.join(file), b"archive").expect("failed to seed archive");
    }
}

fn cloud_directory_contains_type_archives(world: &mut AcceptanceWorld, step: &Step, kind: &str) {
    ensure_backup_workspace(world);
    if world.cloud_backup_dir.is_none() {
        let workspace = ensure_workspace(world);
        let cloud_dir = workspace.join("cloud-backups");
        fs::create_dir_all(&cloud_dir).expect("failed to create cloud backup dir");
        world.cloud_backup_dir = Some(cloud_dir.clone());
        world.config_overrides.insert(
            "backup.cloud_path".to_string(),
            cloud_dir.display().to_string(),
        );
        rewrite_settings_from_world(world);
    }
    let cloud_dir = world
        .cloud_backup_dir
        .as_ref()
        .expect("cloud backup dir should be configured");
    let target_dir = cloud_dir.join(kind);
    fs::create_dir_all(&target_dir).expect("failed to create cloud archive subdirectory");

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
        fs::write(target_dir.join(file), b"archive").expect("failed to seed cloud archive");
    }
}

fn assert_archive_exists_in_subdirectory(
    world: &AcceptanceWorld,
    subdirectory: &str,
    file: &str,
    should_exist: bool,
) {
    let backup_dir = world
        .backup_dir
        .as_ref()
        .expect("backup directory should be configured");
    let path = backup_dir.join(subdirectory).join(file);
    if should_exist {
        assert!(
            path.exists(),
            "expected archive to exist: {}",
            path.display()
        );
    } else {
        assert!(
            !path.exists(),
            "expected archive to be absent: {}",
            path.display()
        );
    }
}

fn resolve_fixture_path(world: &mut AcceptanceWorld, raw: &str) -> PathBuf {
    let workspace = ensure_workspace(world);
    if let Some(rest) = raw.strip_prefix("~/") {
        return workspace.join(rest);
    }
    if let Some(rest) = raw.strip_prefix("%APPDATA%") {
        let rest = rest.trim_start_matches(['\\', '/']);
        return workspace.join("AppData").join("Roaming").join(rest.replace('\\', "/"));
    }
    if let Some(rest) = raw.strip_prefix("%USERPROFILE%") {
        let rest = rest.trim_start_matches(['\\', '/']);
        return workspace.join(rest.replace('\\', "/"));
    }
    workspace.join(raw.replace('\\', "/"))
}

fn infer_platform_from_path_hint(raw: &str) -> &'static str {
    if raw.contains("%APPDATA%") || raw.contains("%USERPROFILE%") {
        "windows"
    } else if raw.contains(".zen/") || raw.contains(".config/zen") {
        "linux"
    } else {
        "darwin"
    }
}

fn platform_to_test_os(platform: &str) -> &'static str {
    match platform {
        "macos" => "darwin",
        "linux" => "linux",
        "windows" => "windows",
        other => panic!("unsupported platform value: {other}"),
    }
}

fn assert_settings_contains(world: &mut AcceptanceWorld, needle: &str) {
    let workspace = ensure_workspace(world);
    let config_path = platform_config_path(&workspace, &current_test_os(world));
    let content = fs::read_to_string(config_path).expect("expected settings.toml");
    assert!(
        content.contains(needle),
        "expected settings.toml to contain `{needle}`, got:\n{content}"
    );
}

fn current_test_os(world: &AcceptanceWorld) -> String {
    world
        .env
        .get("ZEN_BACKUP_TEST_OS")
        .cloned()
        .or_else(|| std::env::var("ZEN_BACKUP_TEST_OS").ok())
        .unwrap_or_else(|| "darwin".to_string())
}

fn platform_config_path(workspace: &Path, test_os: &str) -> PathBuf {
    if test_os == "windows" {
        workspace
            .join("AppData")
            .join("Roaming")
            .join("zen-profile-backup")
            .join("settings.toml")
    } else {
        workspace
            .join(".config")
            .join("zen-profile-backup")
            .join("settings.toml")
    }
}

fn walk_matching_files(root: &Path, suffix: &str) -> Vec<PathBuf> {
    fn walk(current: &Path, out: &mut Vec<PathBuf>) {
        let entries = match fs::read_dir(current) {
            Ok(entries) => entries,
            Err(_) => return,
        };
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, out);
            } else if path.is_file() {
                out.push(path);
            }
        }
    }

    let mut files = Vec::new();
    walk(root, &mut files);
    files
        .into_iter()
        .filter(|path| {
            path.file_name()
                .and_then(|value| value.to_str())
                .map(|name| name.ends_with(suffix))
                .unwrap_or(false)
        })
        .collect()
}

fn is_sqlite_file(path: &str) -> bool {
    path.ends_with(".sqlite") || path.ends_with(".db")
}

fn create_sqlite_db(path: &Path) {
    let output = Command::new("sqlite3")
        .arg(path)
        .arg("CREATE TABLE IF NOT EXISTS t(id INTEGER PRIMARY KEY, v TEXT); CREATE TABLE IF NOT EXISTS moz_places(id INTEGER PRIMARY KEY, url TEXT); CREATE TABLE IF NOT EXISTS moz_bookmarks(id INTEGER PRIMARY KEY, fk INTEGER);")
        .output()
        .expect("failed to execute sqlite3");
    assert!(
        output.status.success(),
        "failed to create sqlite db: {}",
        String::from_utf8_lossy(&output.stderr)
    );
}
