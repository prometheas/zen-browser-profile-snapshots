# Zen Profile Backup

Zen Profile Backup is a cross-platform CLI tool that creates daily and weekly compressed snapshots
of a Zen browser profile, with one-command restore, retention pruning, and optional cloud folder
sync. It is designed to be safe for live profiles by copying SQLite databases using the SQLite
backup API rather than raw file copies.

## Status

Current release status is macOS beta, with Linux beta-in-progress. Core CLI functionality is
implemented with Deno and covered by unit, integration, and acceptance tests. Windows parity is
planned for Milestone 2 completion.

## Key Capabilities

- Scheduled daily/weekly backups via native OS schedulers (launchd/systemd/Task Scheduler)
- Manual backups on demand
- Safe SQLite handling and integrity checks
- Retention pruning for daily and weekly archives
- One-command restore with pre-restore safety backup
- Status and listing commands
- Platform-native notifications for warnings and errors

## Configuration

The tool is configured via TOML:

- macOS/Linux: `~/.config/zen-profile-backup/settings.toml`
- Windows: `%APPDATA%\\zen-profile-backup\\settings.toml`

Expected sections:

- `[profile]` with `path`
- `[backup]` with `local_path` and optional `cloud_path`
- `[retention]` with `daily_days` and `weekly_days`
- `[schedule]` with `daily_time`, `weekly_day`, `weekly_time`
- `[notifications]` with `enabled`

## CLI Commands

- `zen-backup backup daily`
- `zen-backup backup weekly`
- `zen-backup restore <archive>`
- `zen-backup list`
- `zen-backup status`
- `zen-backup install`
- `zen-backup uninstall [--purge-backups]`
- `zen-backup schedule start` (`resume` alias)
- `zen-backup schedule stop` (`pause` alias)
- `zen-backup schedule status`
- `zen-backup feedback bug`
- `zen-backup feedback request`

Global flags:

- `--debug` to emit debug logs to stderr
- `--log-file [path]` to additionally write debug logs to file (`zen-backup-debug.log` when no path
  is provided)

Notes:

- `uninstall` removes scheduler/config and leaves backups by default.
- Use `uninstall --purge-backups` to also remove backup archives.
- macOS launchd labels use `com.prometheas.zen-backup.daily` and `com.prometheas.zen-backup.weekly`.

## Install

### macOS: one-line install from GitHub release (default latest)

Installs to `/usr/local/bin/zen-backup` (uses `sudo` if needed):

```sh
curl -fsSL https://raw.githubusercontent.com/prometheas/zen-browser-profile-snapshots/main/scripts/install-from-release.sh | sh
```

Install a specific version:

```sh
ZEN_BACKUP_VERSION=v0.3.0-beta.1 curl -fsSL https://raw.githubusercontent.com/prometheas/zen-browser-profile-snapshots/main/scripts/install-from-release.sh | sh
```

### macOS: installer package

From GitHub Releases, download either:

- `zen-backup-macos-installer.pkg`
- `zen-backup-macos-installer.dmg` (contains the `.pkg`)

The installer places `zen-backup` at `/usr/local/bin/zen-backup`.

### Manual binary install (macOS/Linux)

Download the platform binary from GitHub Releases and install:

```sh
install -m 0755 ./zen-backup-<target> /usr/local/bin/zen-backup
```

### Build from source (requires Deno 2)

For developer build and test workflows, see
[`docs/development/OVERVIEW.md`](docs/development/OVERVIEW.md).

## First-Time Setup

1. Install config + scheduler:

- `zen-backup install`

1. Verify scheduler:

- `zen-backup schedule status`

1. Run first backup:

- `zen-backup backup daily`

## Test Your Install

- Command smoke:
  - `zen-backup status`
  - `zen-backup list`
- Live scheduler smoke (macOS only):
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler`

Notes:

- The smoke task is intentionally guarded and exits unless `ZEN_BACKUP_LIVE_SMOKE=1` is set.
- If current scheduler jobs are paused before the test, they are left paused.

## Feedback and Issues

Submit feedback directly from the CLI:

- `zen-backup feedback bug`
- `zen-backup feedback request`

If GitHub CLI (`gh`) is available, `zen-backup` creates the issue from your prompt answers. If `gh`
is unavailable, it opens the matching issue template URL in your browser.

You can also report issues in GitHub:

- <https://github.com/prometheas/zen-browser-profile-snapshots/issues>

Please include:

- macOS version and CPU architecture (Apple Silicon or Intel)
- `zen-backup` version/tag used
- exact command run
- stdout/stderr output
- relevant files from `~/zen-backups/backup.log` (if available)

## Development

Development setup, task conventions, testing strategy, and release workflows are documented in:

- [`docs/development/OVERVIEW.md`](docs/development/OVERVIEW.md)

## Docs

The specs are the source of truth:

- [`docs/product/vision.md`](docs/product/vision.md)
- [`docs/product/constitution.md`](docs/product/constitution.md)
- [`docs/product/user-stories.md`](docs/product/user-stories.md)
- [`docs/features/`](docs/features/)
- [`docs/releases/macos-beta-checklist.md`](docs/releases/macos-beta-checklist.md)
- [`docs/releases/linux-beta-checklist.md`](docs/releases/linux-beta-checklist.md)

Command-by-command execution flows and platform mechanism disclosures:

- [`docs/command-execution-reference.md`](docs/command-execution-reference.md)
