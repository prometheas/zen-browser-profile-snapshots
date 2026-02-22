use super::{exists, home_dir, write, SchedulerState, SchedulerStatus, DAILY_LABEL, WEEKLY_LABEL};
use crate::config::AppConfig;
use std::path::PathBuf;

pub fn install(config: &AppConfig) -> Result<SchedulerStatus, String> {
    let agents_dir = home_dir().join("Library").join("LaunchAgents");
    let daily_path = agents_dir.join(format!("{DAILY_LABEL}.plist"));
    let weekly_path = agents_dir.join(format!("{WEEKLY_LABEL}.plist"));

    write(
        &daily_path,
        &plist_template(DAILY_LABEL, "daily", &config.backup_local_path),
    )?;
    write(
        &weekly_path,
        &plist_template(WEEKLY_LABEL, "weekly", &config.backup_local_path),
    )?;
    write(&agents_dir.join(".zen-backup-loaded"), "1")?;
    remove_if_exists(agents_dir.join(format!(".disabled-{DAILY_LABEL}")));
    remove_if_exists(agents_dir.join(format!(".disabled-{WEEKLY_LABEL}")));
    query()
}

pub fn uninstall() -> Result<SchedulerStatus, String> {
    let agents_dir = home_dir().join("Library").join("LaunchAgents");
    remove_if_exists(agents_dir.join(format!("{DAILY_LABEL}.plist")));
    remove_if_exists(agents_dir.join(format!("{WEEKLY_LABEL}.plist")));
    remove_if_exists(agents_dir.join(".zen-backup-loaded"));
    remove_if_exists(agents_dir.join(format!(".disabled-{DAILY_LABEL}")));
    remove_if_exists(agents_dir.join(format!(".disabled-{WEEKLY_LABEL}")));
    Ok(SchedulerStatus {
        labels: vec![],
        states: vec![
            (DAILY_LABEL.to_string(), SchedulerState::NotInstalled),
            (WEEKLY_LABEL.to_string(), SchedulerState::NotInstalled),
        ],
    })
}

pub fn start() -> Result<SchedulerStatus, String> {
    let agents_dir = home_dir().join("Library").join("LaunchAgents");
    if !exists(&agents_dir.join(format!("{DAILY_LABEL}.plist")))
        || !exists(&agents_dir.join(format!("{WEEKLY_LABEL}.plist")))
    {
        return query();
    }
    remove_if_exists(agents_dir.join(format!(".disabled-{DAILY_LABEL}")));
    remove_if_exists(agents_dir.join(format!(".disabled-{WEEKLY_LABEL}")));
    write(&agents_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn stop() -> Result<SchedulerStatus, String> {
    let agents_dir = home_dir().join("Library").join("LaunchAgents");
    if !exists(&agents_dir.join(format!("{DAILY_LABEL}.plist")))
        || !exists(&agents_dir.join(format!("{WEEKLY_LABEL}.plist")))
    {
        return query();
    }
    write(&agents_dir.join(format!(".disabled-{DAILY_LABEL}")), "1")?;
    write(&agents_dir.join(format!(".disabled-{WEEKLY_LABEL}")), "1")?;
    write(&agents_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn query() -> Result<SchedulerStatus, String> {
    let agents_dir = home_dir().join("Library").join("LaunchAgents");
    let daily_installed = exists(&agents_dir.join(format!("{DAILY_LABEL}.plist")));
    let weekly_installed = exists(&agents_dir.join(format!("{WEEKLY_LABEL}.plist")));
    if !daily_installed && !weekly_installed {
        return Ok(SchedulerStatus {
            labels: vec![],
            states: vec![
                (DAILY_LABEL.to_string(), SchedulerState::NotInstalled),
                (WEEKLY_LABEL.to_string(), SchedulerState::NotInstalled),
            ],
        });
    }

    let daily_paused = exists(&agents_dir.join(format!(".disabled-{DAILY_LABEL}")));
    let weekly_paused = exists(&agents_dir.join(format!(".disabled-{WEEKLY_LABEL}")));

    Ok(SchedulerStatus {
        labels: vec![DAILY_LABEL.to_string(), WEEKLY_LABEL.to_string()],
        states: vec![
            (
                DAILY_LABEL.to_string(),
                if daily_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
            (
                WEEKLY_LABEL.to_string(),
                if weekly_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
        ],
    })
}

fn plist_template(label: &str, kind: &str, backup_root: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
  <dict>
    <key>Label</key><string>{label}</string>
    <key>ProgramArguments</key>
    <array>
      <string>zen-backup</string>
      <string>backup</string>
      <string>{kind}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
      <key>ZEN_BACKUP_BACKUP_ROOT</key><string>{backup_root}</string>
    </dict>
  </dict>
</plist>
"#
    )
}

fn remove_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}
