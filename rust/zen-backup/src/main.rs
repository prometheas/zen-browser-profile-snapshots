mod cli;

use std::path::PathBuf;
use std::process::Command;

fn main() {
    let _test_mode = zen_backup::test_mode::from_env();
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.is_empty() {
        eprintln!("{}", cli::help::render_root_help());
        std::process::exit(1);
    }

    let env = std::env::vars().collect::<std::collections::HashMap<_, _>>();
    let color = env.get("CLICOLOR_FORCE").map(String::as_str) == Some("1")
        || env.get("NO_COLOR").map(String::as_str) != Some("1");

    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    match args.first().map(String::as_str) {
        Some("--help") | Some("-h") | Some("help") => {
            println!("{}", cli::help::render_root_help());
        }
        Some("--version") | Some("-v") | Some("version") => {
            let version = env
                .get("ZEN_BACKUP_TEST_VERSION")
                .map(String::as_str)
                .unwrap_or_else(|| zen_backup::version_text());
            println!("{}", cli::version::format_version(version, color));
        }
        Some("schedule") if args.get(1).map(String::as_str) == Some("--help") => {
            println!("{}", cli::help::render_schedule_help());
        }
        Some("feedback") if args.get(1).map(String::as_str) == Some("--help") => {
            println!("{}", cli::help::render_feedback_help());
        }
        Some("status") => {
            let out = zen_backup::commands::status::run_status(&cwd);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("list") => {
            let out = zen_backup::commands::list::run_list(&cwd);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("backup") => {
            let kind = args.get(1).map(String::as_str).unwrap_or_default();
            let out = zen_backup::commands::backup::run_backup(kind, &cwd);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("restore") => {
            let archive = args.get(1).map(String::as_str).unwrap_or_default();
            if archive.is_empty() {
                eprintln!("{}", cli::help::render_root_help());
                std::process::exit(1);
            }
            let out = zen_backup::commands::restore::run_restore(archive, &cwd);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("install") => {
            let out = zen_backup::commands::install::run_install(&cwd);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("uninstall") => {
            let purge_backups = args.iter().any(|arg| arg == "--purge-backups");
            let out = zen_backup::commands::uninstall::run_uninstall(&cwd, purge_backups);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some("schedule") => {
            let action = args.get(1).map(String::as_str).unwrap_or("status");
            let out = zen_backup::commands::schedule::run_schedule(action);
            if !out.stdout.is_empty() {
                println!("{}", out.stdout);
            }
            if !out.stderr.is_empty() {
                eprintln!("{}", out.stderr);
            }
            std::process::exit(out.exit_code);
        }
        Some(_) => {
            let code = delegate_to_typescript(&args);
            std::process::exit(code);
        }
        None => {
            eprintln!("{}", cli::help::render_root_help());
            std::process::exit(1);
        }
    }
}

fn delegate_to_typescript(args: &[String]) -> i32 {
    let mut cmd = Command::new("deno");
    cmd.arg("run")
        .arg("-A")
        .arg("src/main.ts")
        .args(args)
        .env("ZEN_BACKUP_USE_RUST_CLI", "0")
        .stdout(std::process::Stdio::inherit())
        .stderr(std::process::Stdio::inherit());

    match cmd.status() {
        Ok(status) => status.code().unwrap_or(1),
        Err(err) => {
            eprintln!("failed to launch TypeScript fallback runtime: {err}");
            1
        }
    }
}
