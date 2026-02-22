# Command Execution Reference

This reference explains the high-level execution sequence for each `zen-backup` command and the
platform mechanisms used under the hood.

## Cross-Platform Command Flows

### `backup daily|weekly`

```mermaid
flowchart TD
  A[Load config] --> B{Profile path exists?}
  B -- no --> E1[Exit non-zero + error]
  B -- yes --> C[Prepare archive name and paths]
  C --> D[Copy SQLite via backup API]
  D --> E[Pack archive tar.gz]
  E --> F[Apply retention pruning]
  F --> G{Cloud path configured?}
  G -- yes --> H[Copy archive to cloud mirror]
  G -- no --> I[Skip cloud copy]
  H --> J[Write log entries]
  I --> J
  J --> K[Emit notifications as needed]
  K --> L[Exit with success or partial-failure status]
```

### `restore <archive>`

```mermaid
flowchart TD
  A[Load config] --> B{Zen process running?}
  B -- yes --> E1[Exit non-zero + restore blocked]
  B -- no --> C[Locate archive]
  C --> D[Validate archive safety paths]
  D --> E[Rename current profile to pre-restore backup]
  E --> F[Extract archive into profile path]
  F --> G{Extraction succeeded?}
  G -- no --> E2[Preserve pre-restore backup + exit non-zero]
  G -- yes --> H[Write restore log entry]
  H --> I[Exit success]
```

### `list`

```mermaid
flowchart TD
  A[Load config] --> B[Scan daily and weekly directories]
  B --> C[Filter valid archive filenames]
  C --> D[Sort by encoded date]
  D --> E[Render size + type + filename]
  E --> F[Exit]
```

### `status`

```mermaid
flowchart TD
  A[Load config optional] --> B{Config exists?}
  B -- no --> C[Print Not installed guidance]
  B -- yes --> D[Inspect backup directory + latest archives]
  D --> E[Compute disk usage and staleness]
  E --> F[Query scheduler state]
  F --> G[Render health summary]
  G --> H[Exit]
```

### `install`

```mermaid
flowchart TD
  A[Resolve config path] --> B[Detect profile path or prompt]
  B --> C[Resolve backup + cloud defaults]
  C --> D[Write settings.toml]
  D --> E[Install scheduler definitions]
  E --> F[Enable schedule]
  F --> G[Show scheduler labels]
  G --> H[Exit]
```

### `uninstall [--purge-backups]`

```mermaid
flowchart TD
  A[Load config if present] --> B[Disable scheduler jobs]
  B --> C[Remove scheduler definitions]
  C --> D[Remove settings.toml]
  D --> E{--purge-backups?}
  E -- yes --> F[Delete backup archives]
  E -- no --> G[Keep backups + warn user]
  F --> H[Exit]
  G --> H
```

### `schedule start|stop|status` (`resume` alias of `start`, `pause` alias of `stop`)

```mermaid
flowchart TD
  A[Parse action] --> B{start|stop|status?}
  B -- start --> C[Enable scheduler jobs]
  B -- stop --> D[Disable scheduler jobs]
  B -- status --> E[Query scheduler jobs]
  C --> F[Render per-job state]
  D --> F
  E --> F
  F --> G[Exit]
```

### `feedback bug|request`

```mermaid
flowchart TD
  A[Collect required feedback fields] --> B{GitHub CLI available?}
  B -- yes --> C[Create issue via gh issue create]
  B -- no --> D[Open issue template URL in browser]
  C --> E[Print created issue URL]
  D --> F{Browser open succeeded?}
  F -- yes --> G[Print opened URL]
  F -- no --> H[Print manual URL + exit non-zero]
  E --> I[Exit]
  G --> I
```

### Global Debug Flags (`--debug`, `--log-file [path]`)

```mermaid
flowchart TD
  A[Parse global options] --> B{--debug or --log-file set?}
  B -- yes --> C[Enable debug logger]
  C --> D[Write debug lines to stderr]
  D --> E{--log-file set?}
  E -- yes --> F[Append same lines to file]
  E -- no --> G[No file sink]
  B -- no --> H[Debug logging disabled]
```

## Cross-Platform Lifecycle Generalisms

### Notifications

```mermaid
flowchart TD
  A[Backup/restore event occurs] --> B{Needs warning/error notification?}
  B -- no --> C[No notification]
  B -- yes --> D{notifications.enabled?}
  D -- no --> E[Skip notification, keep logs]
  D -- yes --> F[Use platform adapter notification mechanism]
  F --> G{Adapter succeeds?}
  G -- no --> H[Log notification failure fallback]
  G -- yes --> I[Continue command flow]
```

### Scheduling and Unscheduling

```mermaid
flowchart TD
  A[install or schedule start] --> B[Create/enable scheduler definitions]
  B --> C[schedule status query]
  C --> D[schedule stop]
  D --> E[Disable but keep definitions]
  E --> F[uninstall]
  F --> G[Remove definitions and config]
```

## Platform Mechanism Disclosure

| Concern                        | macOS                                                              | Linux                                                   | Windows                                      |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------- | -------------------------------------------- |
| Scheduler install/query/remove | `launchd` plist + `launchctl`                                      | `systemd --user` timers                                 | Task Scheduler (`schtasks` + metadata)       |
| Scheduler pause/resume         | `launchctl unload/load` semantics via adapter                      | `systemctl --user disable/enable` semantics via adapter | Task enable/disable via scheduler adapter    |
| Notification path              | `terminal-notifier` preferred when available, fallback `osascript` | `notify-send` with log fallback                         | PowerShell toast path with fallback logging  |
| Config default location        | `~/.config/zen-profile-backup/settings.toml`                       | `~/.config/zen-profile-backup/settings.toml`            | `%APPDATA%\zen-profile-backup\settings.toml` |
| Feedback fallback              | Open issue template URL in default browser                         | Open issue template URL in default browser              | Open issue template URL in default browser   |

## Traceability

This document is a behavior disclosure view and must remain aligned with product requirements and
acceptance specs:

- Product intent: `docs/product/user-stories.md`
- Acceptance criteria: `docs/features/**/*.feature`
- Command help and user docs: `README.md`
