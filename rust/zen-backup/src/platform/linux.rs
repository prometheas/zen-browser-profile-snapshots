use super::{exists, home_dir, write, SchedulerState, SchedulerStatus, DAILY_TIMER, WEEKLY_TIMER};
use crate::config::AppConfig;
use std::path::PathBuf;

pub fn install(config: &AppConfig) -> Result<SchedulerStatus, String> {
    let systemd_dir = home_dir().join(".config").join("systemd").join("user");
    write(
        &systemd_dir.join("zen-backup-daily.service"),
        "[Service]\nType=oneshot\n",
    )?;
    write(
        &systemd_dir.join("zen-backup-weekly.service"),
        "[Service]\nType=oneshot\n",
    )?;
    write(
        &systemd_dir.join(DAILY_TIMER),
        &timer_template("daily", &config.schedule_daily_time),
    )?;
    write(
        &systemd_dir.join(WEEKLY_TIMER),
        &timer_template("weekly", &config.schedule_weekly_time),
    )?;
    write(&systemd_dir.join(".zen-backup-loaded"), "1")?;
    remove_if_exists(systemd_dir.join(format!(".disabled-{DAILY_TIMER}")));
    remove_if_exists(systemd_dir.join(format!(".disabled-{WEEKLY_TIMER}")));
    query()
}

pub fn uninstall() -> Result<SchedulerStatus, String> {
    let systemd_dir = home_dir().join(".config").join("systemd").join("user");
    remove_if_exists(systemd_dir.join("zen-backup-daily.service"));
    remove_if_exists(systemd_dir.join("zen-backup-weekly.service"));
    remove_if_exists(systemd_dir.join(DAILY_TIMER));
    remove_if_exists(systemd_dir.join(WEEKLY_TIMER));
    remove_if_exists(systemd_dir.join(".zen-backup-loaded"));
    remove_if_exists(systemd_dir.join(format!(".disabled-{DAILY_TIMER}")));
    remove_if_exists(systemd_dir.join(format!(".disabled-{WEEKLY_TIMER}")));
    Ok(SchedulerStatus {
        labels: vec![],
        states: vec![
            (DAILY_TIMER.to_string(), SchedulerState::NotInstalled),
            (WEEKLY_TIMER.to_string(), SchedulerState::NotInstalled),
        ],
    })
}

pub fn start() -> Result<SchedulerStatus, String> {
    let systemd_dir = home_dir().join(".config").join("systemd").join("user");
    if !exists(&systemd_dir.join(DAILY_TIMER)) || !exists(&systemd_dir.join(WEEKLY_TIMER)) {
        return query();
    }
    remove_if_exists(systemd_dir.join(format!(".disabled-{DAILY_TIMER}")));
    remove_if_exists(systemd_dir.join(format!(".disabled-{WEEKLY_TIMER}")));
    write(&systemd_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn stop() -> Result<SchedulerStatus, String> {
    let systemd_dir = home_dir().join(".config").join("systemd").join("user");
    if !exists(&systemd_dir.join(DAILY_TIMER)) || !exists(&systemd_dir.join(WEEKLY_TIMER)) {
        return query();
    }
    write(&systemd_dir.join(format!(".disabled-{DAILY_TIMER}")), "1")?;
    write(&systemd_dir.join(format!(".disabled-{WEEKLY_TIMER}")), "1")?;
    write(&systemd_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn query() -> Result<SchedulerStatus, String> {
    let systemd_dir = home_dir().join(".config").join("systemd").join("user");
    let daily_installed = exists(&systemd_dir.join(DAILY_TIMER));
    let weekly_installed = exists(&systemd_dir.join(WEEKLY_TIMER));
    if !daily_installed && !weekly_installed {
        return Ok(SchedulerStatus {
            labels: vec![],
            states: vec![
                (DAILY_TIMER.to_string(), SchedulerState::NotInstalled),
                (WEEKLY_TIMER.to_string(), SchedulerState::NotInstalled),
            ],
        });
    }

    let daily_paused = exists(&systemd_dir.join(format!(".disabled-{DAILY_TIMER}")));
    let weekly_paused = exists(&systemd_dir.join(format!(".disabled-{WEEKLY_TIMER}")));

    Ok(SchedulerStatus {
        labels: vec![DAILY_TIMER.to_string(), WEEKLY_TIMER.to_string()],
        states: vec![
            (
                DAILY_TIMER.to_string(),
                if daily_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
            (
                WEEKLY_TIMER.to_string(),
                if weekly_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
        ],
    })
}

fn timer_template(kind: &str, time: &str) -> String {
    format!("[Unit]\nDescription=Zen Backup {kind}\n[Timer]\nOnCalendar={time}\n")
}

fn remove_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}
