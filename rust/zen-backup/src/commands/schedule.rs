use crate::platform::{self, SchedulerState};

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_schedule(action: &str) -> CommandOutput {
    let normalized = match action {
        "resume" => "start",
        "pause" => "stop",
        other => other,
    };
    let mut stdout = Vec::new();

    let status = match normalized {
        "start" => platform::start_scheduler(),
        "stop" => platform::stop_scheduler(),
        "status" => platform::query_scheduler(),
        _ => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: "schedule action must be start|resume|stop|pause|status".to_string(),
            }
        }
    };

    if normalized == "start" {
        stdout.push("Scheduled backups started.".to_string());
    }
    if normalized == "stop" {
        stdout.push("Scheduled backups stopped.".to_string());
    }

    match status {
        Ok(scheduler) => {
            if scheduler.labels.is_empty() {
                stdout.push("No scheduled jobs.".to_string());
            } else {
                for (label, state) in scheduler.states {
                    let state_text = match state {
                        SchedulerState::Active => "active",
                        SchedulerState::Paused => "paused",
                        SchedulerState::NotInstalled => "not_installed",
                    };
                    stdout.push(format!("{label}: {state_text}"));
                }
            }
            CommandOutput {
                exit_code: 0,
                stdout: stdout.join("\n"),
                stderr: String::new(),
            }
        }
        Err(err) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: err,
        },
    }
}
