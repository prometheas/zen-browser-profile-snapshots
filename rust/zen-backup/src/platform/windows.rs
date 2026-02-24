use super::{app_data_dir, exists, write, SchedulerState, SchedulerStatus, DAILY_TASK, WEEKLY_TASK};
use crate::config::AppConfig;
use std::path::PathBuf;
use std::process::Command;

pub fn install(config: &AppConfig) -> Result<SchedulerStatus, String> {
    let scheduler_dir = scheduler_dir();
    let (daily_task, weekly_task) = task_names();

    write(
        &scheduler_dir.join(format!("{daily_task}.json")),
        &task_template(&daily_task, "daily", &config.schedule_daily_time),
    )?;
    write(
        &scheduler_dir.join(format!("{weekly_task}.json")),
        &task_template(&weekly_task, "weekly", &config.schedule_weekly_time),
    )?;
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;
    remove_if_exists(scheduler_dir.join(format!(".disabled-{daily_task}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{weekly_task}")));

    if should_manage_native_tasks() {
        create_native_task(&daily_task, "daily", &config.schedule_daily_time, None)?;
        let weekly_day = map_weekday(&config.schedule_weekly_day);
        create_native_task(
            &weekly_task,
            "weekly",
            &config.schedule_weekly_time,
            Some(&weekly_day),
        )?;
    }

    query()
}

pub fn uninstall() -> Result<SchedulerStatus, String> {
    let scheduler_dir = scheduler_dir();
    let (daily_task, weekly_task) = task_names();
    remove_if_exists(scheduler_dir.join(format!("{daily_task}.json")));
    remove_if_exists(scheduler_dir.join(format!("{weekly_task}.json")));
    remove_if_exists(scheduler_dir.join(".zen-backup-loaded"));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{daily_task}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{weekly_task}")));

    if should_manage_native_tasks() {
        let _ = run_schtasks(["/Delete", "/TN", &daily_task, "/F"]);
        let _ = run_schtasks(["/Delete", "/TN", &weekly_task, "/F"]);
    }

    Ok(SchedulerStatus {
        labels: vec![],
        states: vec![
            (daily_task, SchedulerState::NotInstalled),
            (weekly_task, SchedulerState::NotInstalled),
        ],
    })
}

pub fn start() -> Result<SchedulerStatus, String> {
    let scheduler_dir = scheduler_dir();
    let (daily_task, weekly_task) = task_names();
    if !exists(&scheduler_dir.join(format!("{daily_task}.json")))
        || !exists(&scheduler_dir.join(format!("{weekly_task}.json")))
    {
        return query();
    }

    remove_if_exists(scheduler_dir.join(format!(".disabled-{daily_task}")));
    remove_if_exists(scheduler_dir.join(format!(".disabled-{weekly_task}")));
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;

    if should_manage_native_tasks() {
        run_schtasks(["/Change", "/TN", &daily_task, "/ENABLE"])?;
        run_schtasks(["/Change", "/TN", &weekly_task, "/ENABLE"])?;
    }

    query()
}

pub fn stop() -> Result<SchedulerStatus, String> {
    let scheduler_dir = scheduler_dir();
    let (daily_task, weekly_task) = task_names();
    if !exists(&scheduler_dir.join(format!("{daily_task}.json")))
        || !exists(&scheduler_dir.join(format!("{weekly_task}.json")))
    {
        return query();
    }

    write(&scheduler_dir.join(format!(".disabled-{daily_task}")), "1")?;
    write(&scheduler_dir.join(format!(".disabled-{weekly_task}")), "1")?;
    write(&scheduler_dir.join(".zen-backup-loaded"), "1")?;

    if should_manage_native_tasks() {
        run_schtasks(["/Change", "/TN", &daily_task, "/DISABLE"])?;
        run_schtasks(["/Change", "/TN", &weekly_task, "/DISABLE"])?;
    }

    query()
}

pub fn query() -> Result<SchedulerStatus, String> {
    if should_manage_native_tasks() {
        return query_native();
    }
    query_metadata()
}

fn query_metadata() -> Result<SchedulerStatus, String> {
    let scheduler_dir = scheduler_dir();
    let (daily_task, weekly_task) = task_names();
    let daily_installed = exists(&scheduler_dir.join(format!("{daily_task}.json")));
    let weekly_installed = exists(&scheduler_dir.join(format!("{weekly_task}.json")));
    if !daily_installed && !weekly_installed {
        return Ok(SchedulerStatus {
            labels: vec![],
            states: vec![
                (daily_task, SchedulerState::NotInstalled),
                (weekly_task, SchedulerState::NotInstalled),
            ],
        });
    }

    let daily_paused = exists(&scheduler_dir.join(format!(".disabled-{daily_task}")));
    let weekly_paused = exists(&scheduler_dir.join(format!(".disabled-{weekly_task}")));
    Ok(SchedulerStatus {
        labels: vec![daily_task.clone(), weekly_task.clone()],
        states: vec![
            (
                daily_task,
                if daily_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
            (
                weekly_task,
                if weekly_paused {
                    SchedulerState::Paused
                } else {
                    SchedulerState::Active
                },
            ),
        ],
    })
}

fn query_native() -> Result<SchedulerStatus, String> {
    let (daily_task, weekly_task) = task_names();
    let daily = query_native_task(&daily_task)?;
    let weekly = query_native_task(&weekly_task)?;
    if !daily.installed && !weekly.installed {
        return Ok(SchedulerStatus {
            labels: vec![],
            states: vec![
                (daily_task, SchedulerState::NotInstalled),
                (weekly_task, SchedulerState::NotInstalled),
            ],
        });
    }

    Ok(SchedulerStatus {
        labels: vec![daily_task.clone(), weekly_task.clone()],
        states: vec![
            (
                daily_task,
                if !daily.installed {
                    SchedulerState::NotInstalled
                } else if daily.enabled {
                    SchedulerState::Active
                } else {
                    SchedulerState::Paused
                },
            ),
            (
                weekly_task,
                if !weekly.installed {
                    SchedulerState::NotInstalled
                } else if weekly.enabled {
                    SchedulerState::Active
                } else {
                    SchedulerState::Paused
                },
            ),
        ],
    })
}

fn scheduler_dir() -> PathBuf {
    app_data_dir().join("zen-profile-backup").join("task-scheduler")
}

fn task_names() -> (String, String) {
    if let Ok(prefix) = std::env::var("ZEN_BACKUP_WINDOWS_TASK_PREFIX") {
        let trimmed = prefix.trim();
        if !trimmed.is_empty() {
            return (format!("{trimmed}Daily"), format!("{trimmed}Weekly"));
        }
    }
    (DAILY_TASK.to_string(), WEEKLY_TASK.to_string())
}

fn should_manage_native_tasks() -> bool {
    std::env::consts::OS == "windows" && std::env::var("ZEN_BACKUP_TEST_OS").is_err()
}

fn create_native_task(
    task_name: &str,
    backup_kind: &str,
    time: &str,
    weekly_day: Option<&str>,
) -> Result<(), String> {
    let mut args = vec![
        "/Create".to_string(),
        "/TN".to_string(),
        task_name.to_string(),
        "/TR".to_string(),
        format!("zen-backup backup {backup_kind}"),
        "/ST".to_string(),
        time.to_string(),
        "/F".to_string(),
    ];
    if let Some(day) = weekly_day {
        args.extend([
            "/SC".to_string(),
            "WEEKLY".to_string(),
            "/D".to_string(),
            day.to_string(),
        ]);
    } else {
        args.extend(["/SC".to_string(), "DAILY".to_string()]);
    }
    run_schtasks(args)
}

fn map_weekday(value: &str) -> String {
    match value.to_ascii_lowercase().as_str() {
        "monday" => "MON",
        "tuesday" => "TUE",
        "wednesday" => "WED",
        "thursday" => "THU",
        "friday" => "FRI",
        "saturday" => "SAT",
        "sunday" => "SUN",
        _ => "SUN",
    }
    .to_string()
}

fn run_schtasks<I, S>(args: I) -> Result<(), String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let args_vec: Vec<String> = args.into_iter().map(|v| v.as_ref().to_string()).collect();
    let output = Command::new("schtasks")
        .args(&args_vec)
        .output()
        .map_err(|err| format!("failed to run schtasks: {err}"))?;
    if output.status.success() {
        return Ok(());
    }
    Err(format!(
        "schtasks {} failed: {}",
        args_vec.join(" "),
        String::from_utf8_lossy(&output.stderr).trim()
    ))
}

#[derive(Debug, Clone, Copy)]
struct NativeTaskState {
    installed: bool,
    enabled: bool,
}

fn query_native_task(task_name: &str) -> Result<NativeTaskState, String> {
    let list_output = Command::new("schtasks")
        .args(["/Query", "/TN", task_name, "/V", "/FO", "LIST"])
        .output()
        .map_err(|err| format!("failed to query task {task_name}: {err}"))?;
    if !list_output.status.success() {
        return Ok(NativeTaskState {
            installed: false,
            enabled: false,
        });
    }

    let list_text = String::from_utf8_lossy(&list_output.stdout);
    if let Some(enabled) = parse_schtasks_enabled_from_list_output(&list_text) {
        return Ok(NativeTaskState {
            installed: true,
            enabled,
        });
    }

    let xml_output = Command::new("schtasks")
        .args(["/Query", "/TN", task_name, "/XML"])
        .output()
        .map_err(|err| format!("failed to query XML for task {task_name}: {err}"))?;
    if !xml_output.status.success() {
        return Ok(NativeTaskState {
            installed: true,
            enabled: true,
        });
    }
    let xml = String::from_utf8_lossy(&xml_output.stdout);
    Ok(NativeTaskState {
        installed: true,
        enabled: parse_enabled_from_xml(&xml).unwrap_or(true),
    })
}

fn parse_enabled_from_xml(xml: &str) -> Option<bool> {
    if xml.contains("<Enabled>true</Enabled>") {
        return Some(true);
    }
    if xml.contains("<Enabled>false</Enabled>") {
        return Some(false);
    }
    None
}

fn parse_schtasks_enabled_from_list_output(output: &str) -> Option<bool> {
    for raw_line in output.lines() {
        let line = raw_line.trim();
        let lower = line.to_ascii_lowercase();
        if !lower.starts_with("scheduled task state:") {
            continue;
        }
        let state = line.split(':').nth(1)?.trim().to_ascii_lowercase();
        if state.contains("disabled") {
            return Some(false);
        }
        if state.contains("enabled") || state.contains("ready") || state.contains("running") {
            return Some(true);
        }
    }
    None
}

fn task_template(task: &str, kind: &str, time: &str) -> String {
    format!("{{\"task\":\"{task}\",\"kind\":\"{kind}\",\"time\":\"{time}\"}}\n")
}

fn remove_if_exists(path: PathBuf) {
    if path.exists() {
        let _ = std::fs::remove_file(path);
    }
}
