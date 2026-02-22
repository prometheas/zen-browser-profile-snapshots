use super::{
    app_data_dir, exists, write, SchedulerState, SchedulerStatus, DAILY_TASK, WEEKLY_TASK,
};
use crate::config::AppConfig;
use std::path::PathBuf;

pub fn install(config: &AppConfig) -> Result<SchedulerStatus, String> {
    let scheduler_dir = app_data_dir()
        .join("zen-profile-backup")
        .join("task-scheduler");
    write(
        &scheduler_dir.join(format!("{DAILY_TASK}.json")),
        &task_template(DAILY_TASK, "daily", &config.schedule_daily_time),
    )?;
    write(
        &scheduler_dir.join(format!("{WEEKLY_TASK}.json")),
        &task_template(WEEKLY_TASK, "weekly", &config.schedule_weekly_time),
    )?;
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;
    remove_if_exists(scheduler_dir.join(format!(".disabled-{DAILY_TASK}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{WEEKLY_TASK}")));
    query()
}

pub fn uninstall() -> Result<SchedulerStatus, String> {
    let scheduler_dir = app_data_dir()
        .join("zen-profile-backup")
        .join("task-scheduler");
    remove_if_exists(scheduler_dir.join(format!("{DAILY_TASK}.json")));
    remove_if_exists(scheduler_dir.join(format!("{WEEKLY_TASK}.json")));
    remove_if_exists(scheduler_dir.join(".zen-backup-loaded"));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{DAILY_TASK}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{WEEKLY_TASK}")));
    Ok(SchedulerStatus {
        labels: vec![],
        states: vec![
            (DAILY_TASK.to_string(), SchedulerState::NotInstalled),
            (WEEKLY_TASK.to_string(), SchedulerState::NotInstalled),
        ],
    })
}

pub fn start() -> Result<SchedulerStatus, String> {
    let scheduler_dir = app_data_dir()
        .join("zen-profile-backup")
        .join("task-scheduler");
    if !exists(&scheduler_dir.join(format!("{DAILY_TASK}.json")))
        || !exists(&scheduler_dir.join(format!("{WEEKLY_TASK}.json")))
    {
        return query();
    }
    remove_if_exists(scheduler_dir.join(format!(".disabled-{DAILY_TASK}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{WEEKLY_TASK}")));
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn stop() -> Result<SchedulerStatus, String> {
    let scheduler_dir = app_data_dir()
        .join("zen-profile-backup")
        .join("task-scheduler");
    if !exists(&scheduler_dir.join(format!("{DAILY_TASK}.json")))
        || !exists(&scheduler_dir.join(format!("{WEEKLY_TASK}.json")))
    {
        return query();
    }
    write(&scheduler_dir.join(format!(".disabled-{DAILY_TASK}")), "1")?;
    write(&scheduler_dir.join(format!(".disabled-{WEEKLY_TASK}")), "1")?;
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;
    query()
}

pub fn query() -> Result<SchedulerStatus, String> {
    let scheduler_dir = app_data_dir()
        .join("zen-profile-backup")
        .join("task-scheduler");
    let daily_installed = exists(&scheduler_dir.join(format!("{DAILY_TASK}.json")));
    let weekly_installed = exists(&scheduler_dir.join(format!("{WEEKLY_TASK}.json")));
    if !daily_installed && !weekly_installed {
        return Ok(SchedulerStatus {
            labels: vec![],
            states: vec![
                (DAILY_TASK.to_string(), SchedulerState::NotInstalled),
                (WEEKLY_TASK.to_string(), SchedulerState::NotInstalled),
            ],
        });
    }
    let daily_paused = exists(&scheduler_dir.join(format!(".disabled-{DAILY_TASK}")));
    let weekly_paused = exists(&scheduler_dir.join(format!(".disabled-{WEEKLY_TASK}")));

    Ok(SchedulerStatus {
        labels: vec![DAILY_TASK.to_string(), WEEKLY_TASK.to_string()],
        states: vec![
            (
                DAILY_TASK.to_string(),
                if daily_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
            (
                WEEKLY_TASK.to_string(),
                if weekly_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
        ],
    })
}

fn task_template(task: &str, kind: &str, time: &str) -> String {
    format!("{{\"task\":\"{task}\",\"kind\":\"{kind}\",\"time\":\"{time}\"}}\n")
}

fn remove_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}
