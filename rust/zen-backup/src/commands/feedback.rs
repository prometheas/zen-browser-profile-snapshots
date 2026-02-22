use serde_json::Value;
use std::collections::HashMap;
use std::process::Command;

pub struct CommandOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
}

pub fn run_feedback(kind: &str) -> CommandOutput {
    if kind != "bug" && kind != "request" {
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: "Usage: zen-backup feedback <bug|request>".to_string(),
        };
    }

    let answers = match collect_answers(kind) {
        Ok(v) => v,
        Err(err) => {
            return CommandOutput {
                exit_code: 1,
                stdout: String::new(),
                stderr: err,
            }
        }
    };

    let issue = build_feedback_issue(kind, &answers);
    if !is_gh_available() {
        let url = feedback_template_url(kind);
        if open_browser_url(&url) {
            return CommandOutput {
                exit_code: 0,
                stdout: format!("Opened feedback URL: {url}"),
                stderr: String::new(),
            };
        }
        return CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: format!("Failed to open browser.\nOpen this URL manually: {url}"),
        };
    }

    match create_github_issue(&issue.title, &issue.body, &issue.labels) {
        Ok(url) => CommandOutput {
            exit_code: 0,
            stdout: format!("Created issue: {url}"),
            stderr: String::new(),
        },
        Err(err) => CommandOutput {
            exit_code: 1,
            stdout: String::new(),
            stderr: err,
        },
    }
}

struct FeedbackIssue {
    title: String,
    body: String,
    labels: Vec<String>,
}

fn build_feedback_issue(kind: &str, answers: &HashMap<String, String>) -> FeedbackIssue {
    if kind == "bug" {
        let title = answers
            .get("title")
            .cloned()
            .unwrap_or_else(|| "Untitled bug".to_string());
        return FeedbackIssue {
            title: format!("[Bug]: {title}"),
            labels: vec!["bug".to_string(), "triage".to_string()],
            body: format!(
                "## Description\n{}\n\n## Steps to Reproduce\n{}\n\n## Expected Behavior\n{}",
                answers.get("description").cloned().unwrap_or_default(),
                answers
                    .get("steps_to_reproduce")
                    .cloned()
                    .unwrap_or_default(),
                answers
                    .get("expected_behavior")
                    .cloned()
                    .unwrap_or_default()
            ),
        };
    }
    let title = answers
        .get("title")
        .cloned()
        .unwrap_or_else(|| "Untitled feature".to_string());
    FeedbackIssue {
        title: format!("[Feature]: {title}"),
        labels: vec!["feature".to_string(), "enhancement".to_string()],
        body: format!(
            "## Problem Statement\n{}\n\n## Proposed Solution\n{}\n\n## Relevant Platforms\n{}",
            answers.get("problem").cloned().unwrap_or_default(),
            answers.get("solution").cloned().unwrap_or_default(),
            answers
                .get("platforms")
                .cloned()
                .unwrap_or_else(|| "all".to_string())
        ),
    }
}

fn collect_answers(kind: &str) -> Result<HashMap<String, String>, String> {
    if let Ok(prefilled) = std::env::var("ZEN_BACKUP_TEST_FEEDBACK_ANSWERS") {
        let parsed: Value =
            serde_json::from_str(&prefilled).map_err(|_| "invalid feedback answers json")?;
        let mut out = HashMap::new();
        if let Some(obj) = parsed.as_object() {
            for (key, value) in obj {
                if let Some(text) = value.as_str() {
                    out.insert(key.to_string(), text.to_string());
                }
            }
        }
        return Ok(out);
    }

    let fields = if kind == "bug" {
        vec![
            "title",
            "description",
            "steps_to_reproduce",
            "expected_behavior",
        ]
    } else {
        vec!["title", "problem", "solution", "platforms"]
    };
    let mut out = HashMap::new();
    for field in fields {
        let value = std::env::var(format!("ZEN_BACKUP_FEEDBACK_{}", field.to_uppercase()))
            .ok()
            .unwrap_or_default();
        if value.trim().is_empty() {
            return Err(format!("missing required field: {field}"));
        }
        out.insert(field.to_string(), value);
    }
    Ok(out)
}

fn feedback_template_url(kind: &str) -> String {
    let template = if kind == "bug" {
        "bug-report.yml"
    } else {
        "feature-request.yml"
    };
    format!(
        "https://github.com/prometheas/zen-browser-profile-snapshots/issues/new?template={template}"
    )
}

fn is_gh_available() -> bool {
    match std::env::var("ZEN_BACKUP_TEST_GH_AVAILABLE")
        .ok()
        .as_deref()
    {
        Some("1") => return true,
        Some("0") => return false,
        _ => {}
    }
    Command::new("gh")
        .arg("--version")
        .status()
        .map(|v| v.success())
        .unwrap_or(false)
}

fn create_github_issue(title: &str, body: &str, labels: &[String]) -> Result<String, String> {
    if std::env::var("ZEN_BACKUP_TEST_GH_AVAILABLE").as_deref() == Ok("1") {
        return Ok(
            std::env::var("ZEN_BACKUP_TEST_GH_CREATED_URL").unwrap_or_else(|_| {
                "https://github.com/prometheas/zen-browser-profile-snapshots/issues/1".to_string()
            }),
        );
    }

    let mut args = vec![
        "issue".to_string(),
        "create".to_string(),
        "--title".to_string(),
        title.to_string(),
        "--body".to_string(),
        body.to_string(),
    ];
    for label in labels {
        args.push("--label".to_string());
        args.push(label.clone());
    }
    if let Ok(repo) = std::env::var("ZEN_BACKUP_GH_REPO") {
        if !repo.trim().is_empty() {
            args.push("--repo".to_string());
            args.push(repo);
        }
    }
    let output = Command::new("gh")
        .args(args)
        .output()
        .map_err(|err| err.to_string())?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "gh issue create failed".to_string()
        } else {
            stderr
        });
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    Ok(stdout.lines().last().unwrap_or_default().to_string())
}

fn open_browser_url(url: &str) -> bool {
    match std::env::var("ZEN_BACKUP_TEST_BROWSER_OPEN")
        .ok()
        .as_deref()
    {
        Some("1") => return true,
        Some("0") => return false,
        _ => {}
    }
    let os =
        std::env::var("ZEN_BACKUP_TEST_OS").unwrap_or_else(|_| std::env::consts::OS.to_string());
    if os == "darwin" {
        return Command::new("open")
            .arg(url)
            .status()
            .map(|v| v.success())
            .unwrap_or(false);
    }
    if os == "windows" {
        return Command::new("cmd")
            .arg("/c")
            .arg("start")
            .arg("")
            .arg(url)
            .status()
            .map(|v| v.success())
            .unwrap_or(false);
    }
    Command::new("xdg-open")
        .arg(url)
        .status()
        .map(|v| v.success())
        .unwrap_or(false)
}
