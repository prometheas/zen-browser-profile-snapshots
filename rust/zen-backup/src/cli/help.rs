pub fn render_root_help() -> String {
    [
        "Zen Profile Backup",
        "",
        "Usage",
        "  zen-backup <command> [options]",
        "",
        "Global Options",
        "  -h, --help",
        "  -v, --version",
        "  --debug",
        "  --log-file [path]",
        "",
        "Commands",
        "  backup <daily|weekly>",
        "  restore <archive>",
        "  list",
        "  status",
        "  install",
        "  uninstall [--purge-backups]",
        "  schedule <start|resume|stop|pause|status>",
        "  feedback <bug|request>",
    ]
    .join("\n")
}

pub fn render_schedule_help() -> String {
    [
        "zen-backup schedule",
        "",
        "Usage",
        "  zen-backup schedule <start|resume|stop|pause|status>",
        "",
        "Notes",
        "  resume = start",
        "  pause = stop",
    ]
    .join("\n")
}

pub fn render_feedback_help() -> String {
    [
        "zen-backup feedback",
        "",
        "Usage",
        "  zen-backup feedback <bug|request>",
    ]
    .join("\n")
}
