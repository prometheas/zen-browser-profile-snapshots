# Zen Profile Backup — User Stories

> Platform-specific tool choices and OS mechanics are defined in
> `docs/features/platform/**/*.feature`. User stories here stay product-level and platform-agnostic.

## Scheduling

### US-01 Automatic Daily Backups

**As a** Zen browser user **I want** daily backups to run automatically on a schedule **So that** I
don't have to remember to back up my profile manually

**Acceptance criteria:**

- A scheduled task fires a daily backup at a configurable time (default: 12:30, local time)
- The backup runs without any user interaction
- Output is written to a log file
- Works through the platform's native scheduling mechanism

---

### US-02 Automatic Weekly Backups

**As a** Zen browser user **I want** weekly backups to run automatically every Sunday **So that** I
have long-term snapshots I can roll back to weeks later

**Acceptance criteria:**

- A scheduled task fires a weekly backup at a configurable time (default: 02:00 Sunday, local time)
- The backup is stored separately from daily archives
- Output is written to a log file
- Works through the platform's native scheduling mechanism

---

## Manual Backup

### US-03 Manual Daily Backup

**As a** Zen browser user **I want** to trigger a daily backup on demand **So that** I can take a
snapshot before a risky operation

**Acceptance criteria:**

- `zen-backup backup daily` creates a new daily archive immediately
- The archive appears in the configured local backup directory
- If an archive already exists for the same day, a numeric suffix is appended (e.g., `-2`, `-3`)

---

### US-04 Manual Weekly Backup

**As a** Zen browser user **I want** to trigger a weekly backup on demand **So that** I can take a
long-term snapshot at any time

**Acceptance criteria:**

- `zen-backup backup weekly` creates a new weekly archive immediately
- The archive appears in the configured local backup directory
- If an archive already exists for the same day, a numeric suffix is appended (e.g., `-2`, `-3`)

---

## SQLite Safety

### US-05 Safe SQLite Backup

**As a** Zen browser user **I want** SQLite databases to be backed up using SQLite backup API **So
that** I never get corrupted or partially-written database copies

**Acceptance criteria:**

- All `.sqlite` and `.db` files are copied via SQLite backup API, not raw file copy
- The resulting copies pass `PRAGMA integrity_check`
- WAL and SHM sidecar files are not included in the archive

---

### US-06 SQLite Backup Fallback When Browser Is Running

**As a** Zen browser user **I want** SQLite backups to fall back gracefully if a database is
exclusively locked **So that** backups succeed even when Zen may still be open

**Acceptance criteria:**

- If SQLite backup fails due to an exclusive lock, the script falls back to copying the db + WAL/SHM
  files then checkpointing the copy
- The fallback produces a single clean database file without sidecar files

---

## Profile Coverage

### US-07 Complete Profile Coverage

**As a** Zen browser user **I want** all critical profile data backed up **So that** I can fully
recover my browser experience after data loss

**Acceptance criteria:**

- The following are included in every backup:
  - History and bookmarks (`places.sqlite`)
  - Permissions (`permissions.sqlite`)
  - Form history (`formhistory.sqlite`)
  - Extension configurations (`storage-sync-v2.sqlite`, extension sqlite in `moz-extension+++*`
    dirs)
  - Favourites (`favicons.sqlite`)
  - Content preferences (`content-prefs.sqlite`)
  - Local storage archive (`storage/ls-archive.sqlite`)
  - Preferences (`prefs.js`, `user.js`)
  - Extension manifests and XPI files (`extensions/`, `extensions.json`)
  - Session state (`sessionstore-backups/`, `sessionstore.jsonlz4`)
  - Zen-specific: workspaces, themes, shortcuts (`zen-workspaces.json`, `zen-themes.json`,
    `zen-keyboard-shortcuts.json`)
  - Extension store data (`extension-store/`, `browser-extension-data/`)
  - Permanent storage (`storage/permanent/`)

**Explicitly excluded (security):**

- Cookies (`cookies.sqlite`) — contains session tokens and authentication data
- Encryption keys (`key4.db`)
- Saved passwords (`logins.json`)
- Certificate database (`cert9.db`)

---

### US-08 Exclusion of Rebuild-able Data

**As a** Zen browser user **I want** browser caches, crash dumps, telemetry, and transient data
excluded from backups **So that** archives are small and fast to create

**Acceptance criteria:**

- The following are never included in a backup archive:
  - `cache2/`
  - `crashes/`
  - `datareporting/`
  - `saved-telemetry-pings/`
  - `minidumps/`
  - `storage/temporary/`
  - `storage/default/http*` (site-specific HTTP caches)
  - `storage/default/chrome/`
  - `.parentlock`
  - `*.sqlite-wal` and `*.sqlite-shm` files

---

### US-09 Extension Runtime Data Coverage

**As a** Zen browser user **I want** extension data stored inside `moz-extension+++*` directories to
be backed up **So that** my extension configurations and runtime data are preserved

**Acceptance criteria:**

- SQLite databases inside `storage/default/moz-extension+++*/` are backed up via SQLite backup API
- Non-SQLite files inside `moz-extension+++*/` are included in the archive

---

## Cloud Sync

### US-10 Optional Cloud Sync

**As a** Zen browser user **I want** backup archives to be optionally synced to a cloud storage
folder **So that** my backups survive a local disk failure

**Acceptance criteria:**

- When `cloud_path` points to a cloud-synced folder, each new archive is copied there after local
  creation
- The cloud directory mirrors the `daily/` and `weekly/` structure
- Supported providers are platform-dependent and documented in platform feature files

---

### US-11 Local-Only Mode

**As a** Zen browser user **I want** to disable cloud sync and use local backups only **So that**
I'm not required to use any cloud storage service

**Acceptance criteria:**

- When `cloud_path` is empty or absent, no cloud copy is attempted
- The backup returns successfully without errors when cloud sync is disabled

---

## Retention

### US-12 Automatic Daily Retention Enforcement

**As a** Zen browser user **I want** daily backup archives older than the configured retention
period to be automatically deleted **So that** old dailies don't accumulate and fill up my disk

**Acceptance criteria:**

- After each backup run, archives in the daily directory older than `retention.daily_days` are
  deleted
- Archives within the retention window are preserved
- The same pruning applies to the cloud daily directory if configured

---

### US-13 Automatic Weekly Retention Enforcement

**As a** Zen browser user **I want** weekly backup archives older than the configured retention
period to be automatically deleted **So that** weekly archives are kept within reasonable bounds

**Acceptance criteria:**

- After each backup run, archives in the weekly directory older than `retention.weekly_days` are
  deleted
- Archives within the retention window are preserved
- The same pruning applies to the cloud weekly directory if configured

---

### US-14 Configurable Retention Periods

**As a** Zen browser user **I want** to set custom retention periods for daily and weekly archives
**So that** I can keep backups for longer or shorter depending on my storage constraints

**Acceptance criteria:**

- `retention.daily_days` and `retention.weekly_days` in `settings.toml` control how long each type
  is kept
- Defaults are 30 days for daily and 84 days (12 weeks) for weekly
- Missing config values fall back to defaults with no warning

---

## Restore

### US-15 One-Command Restore

**As a** Zen browser user **I want** to restore from any snapshot with a single command **So that**
recovery from a broken profile is fast and simple

**Acceptance criteria:**

- `zen-backup restore <archive>` fully restores the profile from the specified archive
- No additional steps, database imports, or manual file operations are required
- The command prints the path of the restored archive and the pre-restore backup

---

### US-16 Safety Pre-Restore Backup

**As a** Zen browser user **I want** my current profile to be saved before a restore overwrites it
**So that** I can undo the restore if needed

**Acceptance criteria:**

- Before extracting the archive, the current profile directory is renamed to
  `<profile>.pre-restore-YYYY-MM-DD`
- The pre-restore backup is left in place after restore completes

---

### US-17 Restore Blocked When Browser Is Running

**As a** Zen browser user **I want** the restore command to refuse to run if Zen is open **So that**
I don't corrupt my active browser session

**Acceptance criteria:**

- If a running Zen process is detected, restore exits with a non-zero status
- An error message is printed: "Zen browser must be closed before restoring"
- The current profile is not modified in any way
- Detection works across supported platforms

---

## Listing and Status

### US-18 List Available Snapshots

**As a** Zen browser user **I want** to see all available backup snapshots with their type, date,
and size **So that** I can identify and pick the right snapshot to restore from

**Acceptance criteria:**

- `zen-backup list` prints all archives in the `daily/` and `weekly/` subdirectories
- Each entry shows the type label, file size, and filename (which encodes the date)
- Archives are listed in chronological order within each type

---

### US-19 Backup Status Dashboard

**As a** Zen browser user **I want** a status command that shows the last backup time, scheduled
jobs, and disk usage **So that** I can confirm the backup system is healthy and working

**Acceptance criteria:**

- `zen-backup status` shows the most recent daily and weekly archive (name, date, size)
- Shows "no backups yet" for types with no archives
- Lists scheduled job status (loaded/not loaded) via platform-native scheduler query
- Shows total disk usage of the backup directory
- Shows "Not installed" and prompts to run `zen-backup install` if settings.toml is missing

---

## Notifications

### US-20 Notification When Backing Up With Browser Open

**As a** Zen browser user **I want** to be notified if a backup runs while Zen is open **So that**
I'm aware the backup may include mid-write session files

**Acceptance criteria:**

- If Zen is detected as running at the start of backup, a platform-native notification is displayed
- The notification explains that SQLite databases are safe but session files may be mid-write
- The backup continues and completes despite the warning
- Notification method uses the platform-native notification mechanism
- Notifications can be disabled via configuration

---

## Logging

### US-21 Persistent Backup Logging

**As a** Zen browser user **I want** all backup and restore events written to a log file **So that**
I can audit history and diagnose failures

**Acceptance criteria:**

- Every successful backup appends a `[timestamp] SUCCESS: ...` entry to `backup.log`
- Every restore appends a `[timestamp] RESTORE: ...` entry
- A Zen-running warning during backup appends a `[timestamp] WARNING: ...` entry
- Errors append a `[timestamp] ERROR: ...` entry
- The log file is in the configured local backup directory

---

## Configuration

### US-22 TOML-Based Configuration

**As a** Zen browser user **I want** to configure paths and retention settings via a TOML file **So
that** I can customise the tool without editing source code

**Acceptance criteria:**

- The config file lives at a platform-appropriate default location
- It supports sections `[profile]`, `[backup]`, `[retention]`, `[schedule]`, and `[notifications]`
- Tilde (`~`) and environment variables in path values are expanded
- Quoted and unquoted values are both handled correctly

---

### US-23 Overridable Config Path

**As a** Zen browser user **I want** to override the config file location via an environment
variable **So that** I can use different configs in test or multi-environment contexts

**Acceptance criteria:**

- Setting `ZEN_BACKUP_CONFIG=custom/config.toml` causes the tool to read that file instead
- When the env var is unset, the default path is used

---

## Installation

### US-24 Auto-Detecting Interactive Installer

**As a** Zen browser user **I want** an interactive installer to detect my Zen profile and guide me
through setup **So that** configuration and scheduling are ready without manual file editing

**Acceptance criteria:**

- `zen-backup install` auto-detects the profile directory using known platform-default locations
- If none is found, the user is prompted to enter the path manually
- The user is prompted for a local backup directory (default: `~/zen-backups` or
  `%USERPROFILE%\zen-backups`)
- The user selects or skips cloud sync
- A valid `settings.toml` is written on completion

---

### US-25 Cloud Sync Provider Selection During Install

**As a** Zen browser user **I want** the installer to detect and offer my available cloud storage
providers **So that** I can pick a provider without knowing the exact path

**Acceptance criteria:**

- If Google Drive is detected, it appears as a numbered option
- If OneDrive is detected, it appears as a numbered option
- If Dropbox is detected, it appears as a numbered option
- Platform-specific provider availability is defined in platform feature files
- A "Custom path" option is always available
- A "None (local only)" option is always available

---

### US-26 Automated Scheduling on Install

**As a** Zen browser user **I want** scheduled jobs installed automatically during setup **So that**
backups are scheduled without manual scheduler commands

**Acceptance criteria:**

- `zen-backup install` installs and enables both daily and weekly scheduled tasks
- Scheduler integration uses platform-native facilities
- Paths are substituted with actual values (no placeholders)

---

### US-27 Non-Destructive Uninstall

**As a** Zen browser user **I want** to uninstall scheduled jobs and settings while keeping backups
by default **So that** I can safely disable automation without accidentally deleting archives

**Acceptance criteria:**

- `zen-backup uninstall` removes scheduled tasks from the platform scheduler
- `settings.toml` is removed
- Existing backup archives are not deleted by default
- Uninstall prints a warning that archives remain and suggests `--purge-backups`
- `zen-backup uninstall --purge-backups` removes backup archives

---

### US-33 Scheduler Lifecycle Commands

**As a** Zen browser user **I want** explicit schedule lifecycle commands **So that** I can start,
stop, and inspect scheduling without reinstalling

**Acceptance criteria:**

- `zen-backup schedule start` enables scheduling
- `zen-backup schedule stop` disables scheduling without removing definitions
- `zen-backup schedule resume` is an alias of `start`
- `zen-backup schedule pause` is an alias of `stop`
- `zen-backup schedule status` reports state for daily and weekly jobs

---

## Feedback and Diagnostics

### US-34 In-CLI Feedback Submission

**As a** Zen browser user **I want** to submit bug reports and feature requests from the CLI **So
that** I can provide actionable feedback without leaving the terminal

**Acceptance criteria:**

- `zen-backup feedback bug` collects required bug details and submits feedback
- `zen-backup feedback request` collects feature request details and submits feedback
- If direct CLI submission is unavailable, the tool opens the matching issue template URL
- Result output clearly states whether feedback was submitted directly or opened in the browser

---

### US-35 Optional Debug Logging for Commands

**As a** Zen browser user **I want** optional debug logging **So that** I can share diagnostics when
reporting problems

**Acceptance criteria:**

- `--debug` enables debug logs written to stderr for command execution
- `--log-file [path]` writes the same debug logs to a file
- If `--log-file` is set without a path, default filename is `zen-backup-debug.log`
- Debug logging is available as a global option for CLI commands

---

## Error Handling

### US-28 Error: Profile Directory Missing

**As a** Zen browser user **I want** a clear error when my profile directory doesn't exist **So
that** I know to fix my configuration

**Acceptance criteria:**

- If the configured profile path doesn't exist, backup exits with non-zero status
- Error message includes the path that was not found
- A platform-native error notification is displayed if notifications are enabled

---

### US-29 Error: Disk Full During Backup

**As a** Zen browser user **I want** partial backup files cleaned up if disk becomes full **So
that** I don't have corrupted archives taking up space

**Acceptance criteria:**

- If disk full error occurs during archive creation, partial files are deleted
- Exit with non-zero status
- Error is logged to `backup.log`
- Error notification is displayed if notifications are enabled

---

### US-30 Error: SQLite Corruption

**As a** Zen browser user **I want** corrupted SQLite files to be skipped with a warning **So that**
one corrupted file doesn't prevent the rest of my profile from being backed up

**Acceptance criteria:**

- If a SQLite file fails integrity check after backup, log a warning
- Continue with remaining files
- Archive is created but marked with warning in filename suffix
- Backup returns success but logs indicate the corruption

---

### US-31 Error: Cloud Sync Failure

**As a** Zen browser user **I want** local backup to succeed even if cloud sync fails **So that** I
always have at least a local copy

**Acceptance criteria:**

- If cloud path is inaccessible or copy fails, local backup is still preserved
- Error is logged to `backup.log`
- Error notification is displayed if notifications are enabled
- Exit with non-zero status to indicate partial failure

---

### US-32 Error: Corrupted Archive on Restore

**As a** Zen browser user **I want** my original profile preserved if a restore archive is corrupted
**So that** a bad restore doesn't leave me worse off

**Acceptance criteria:**

- If archive extraction fails, exit with non-zero status immediately
- Original profile is not modified (pre-restore backup may have been created)
- Error message identifies the corrupted archive
- Error notification is displayed if notifications are enabled

---

## Archive Naming

- Daily: `zen-backup-daily-YYYY-MM-DD.tar.gz`
- Weekly: `zen-backup-weekly-YYYY-MM-DD.tar.gz`
- If a same-day archive already exists, append `-2`, `-3`, etc. before the extension
