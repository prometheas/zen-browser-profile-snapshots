#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedGlobalOptions {
    pub command_args: Vec<String>,
    pub debug_enabled: bool,
    pub log_file_path: Option<String>,
}

pub fn parse_global_options(args: Vec<String>) -> ParsedGlobalOptions {
    let mut command_args = Vec::new();
    let mut debug_enabled = false;
    let mut log_file_path = None;
    let known_root_commands = [
        "backup",
        "restore",
        "list",
        "status",
        "install",
        "uninstall",
        "schedule",
        "feedback",
        "help",
        "version",
        "-h",
        "--help",
        "-v",
        "--version",
    ];

    let mut i = 0;
    while i < args.len() {
        let arg = args[i].as_str();
        if arg == "--debug" {
            debug_enabled = true;
            i += 1;
            continue;
        }
        if arg == "--log-file" {
            let next = args.get(i + 1).map(String::as_str);
            if let Some(value) = next {
                if !value.starts_with('-') && !known_root_commands.contains(&value) {
                    log_file_path = Some(value.to_string());
                    i += 2;
                    continue;
                }
            }
            log_file_path = Some("zen-backup-debug.log".to_string());
            i += 1;
            continue;
        }
        command_args.push(args[i].clone());
        i += 1;
    }

    ParsedGlobalOptions {
        command_args,
        debug_enabled,
        log_file_path,
    }
}
