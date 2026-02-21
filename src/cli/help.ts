type HelpTopic =
  | "root"
  | "backup"
  | "restore"
  | "list"
  | "status"
  | "install"
  | "uninstall"
  | "schedule";

interface HelpRenderOptions {
  color: boolean;
}

export function renderHelp(topic: HelpTopic = "root", options: HelpRenderOptions): string {
  const style = createStyle(options.color);
  if (topic === "backup") {
    return [
      style.title("zen-backup backup"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup backup <daily|weekly>")}`,
      "",
      style.label("Description"),
      "  Create a manual backup archive for your Zen profile.",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for backup command`,
    ].join("\n");
  }

  if (topic === "restore") {
    return [
      style.title("zen-backup restore"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup restore <archive>")}`,
      "",
      style.label("Description"),
      "  Restore profile state from a backup archive.",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for restore command`,
    ].join("\n");
  }

  if (topic === "schedule") {
    return [
      style.title("zen-backup schedule"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup schedule <start|stop|pause|resume|status>")}`,
      "",
      style.label("Description"),
      "  Manage scheduled backup jobs.",
      "",
      style.label("Aliases"),
      "  resume = start",
      "  pause  = stop",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for schedule command`,
    ].join("\n");
  }

  if (topic === "list") {
    return [
      style.title("zen-backup list"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup list")}`,
      "",
      style.label("Description"),
      "  Show daily and weekly backup archives in chronological order.",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for list command`,
    ].join("\n");
  }

  if (topic === "status") {
    return [
      style.title("zen-backup status"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup status")}`,
      "",
      style.label("Description"),
      "  Show install state, scheduler state, and backup freshness details.",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for status command`,
    ].join("\n");
  }

  if (topic === "install") {
    return [
      style.title("zen-backup install"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup install")}`,
      "",
      style.label("Description"),
      "  Set up config defaults and install scheduled backup jobs.",
      "",
      style.label("Options"),
      `  ${style.command("-h, --help")}    Show help for install command`,
    ].join("\n");
  }

  if (topic === "uninstall") {
    return [
      style.title("zen-backup uninstall"),
      "",
      style.label("Usage"),
      `  ${style.command("zen-backup uninstall [--purge-backups]")}`,
      "",
      style.label("Description"),
      "  Remove scheduler/config. Backups are kept unless purge is requested.",
      "",
      style.label("Options"),
      `  ${style.command("--purge-backups")}    Remove local backup archives`,
      `  ${style.command("-h, --help")}          Show help for uninstall command`,
    ].join("\n");
  }

  return [
    style.title("Zen Profile Backup"),
    style.subtle("Reliable daily/weekly profile snapshots with safe restore."),
    "",
    style.label("Usage"),
    `  ${style.command("zen-backup <command> [options]")}`,
    "",
    style.label("Commands"),
    `  ${style.command("backup daily")}            Create a daily backup now`,
    `  ${style.command("backup weekly")}           Create a weekly backup now`,
    `  ${style.command("restore <archive>")}       Restore from a backup archive`,
    `  ${style.command("list")}                    List available backup archives`,
    `  ${style.command("status")}                  Show install and backup health`,
    `  ${style.command("install")}                 Create config and install scheduler`,
    `  ${style.command("uninstall")}               Remove scheduler and config`,
    `  ${style.command("schedule <action>")}       Start/stop/pause/resume/status`,
    "",
    style.label("Global Options"),
    `  ${style.command("-h, --help")}              Show this help`,
    "",
    style.label("Examples"),
    `  ${style.command("zen-backup install")}`,
    `  ${style.command("zen-backup backup daily")}`,
    `  ${style.command("zen-backup schedule status")}`,
    "",
    style.subtle("Use `zen-backup <command> --help` for command-specific usage."),
  ].join("\n");
}

export function isHelpFlag(value: string | undefined): boolean {
  return value === "-h" || value === "--help";
}

function createStyle(color: boolean) {
  return {
    title: (text: string) => paint(color, text, "36"),
    label: (text: string) => paint(color, paint(color, text, "1"), "33"),
    command: (text: string) => paint(color, text, "32"),
    subtle: (text: string) => paint(color, text, "2"),
  };
}

function paint(color: boolean, text: string, code: string): string {
  return color ? `\u001b[${code}m${text}\u001b[0m` : text;
}
