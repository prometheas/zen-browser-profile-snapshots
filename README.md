# Zen Profile Backup

Zen Profile Backup is a cross-platform CLI tool that creates daily and weekly compressed snapshots
of a Zen browser profile, with one-command restore, retention pruning, and optional cloud folder
sync. It is designed to be safe for live profiles by copying SQLite databases using the SQLite
backup API rather than raw file copies.

## Status

Core CLI functionality is implemented with Deno and covered by unit, integration, and acceptance
tests. Current scope includes backup, list, status, restore, and macOS
install/scheduling/notification flows.

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

Notes:

- `uninstall` removes scheduler/config and leaves backups by default.
- use `uninstall --purge-backups` to also remove backup archives.
- macOS launchd labels use `com.prometheas.zen-backup.daily` and `com.prometheas.zen-backup.weekly`.

## Packaging

- Build macOS binaries:
  - `deno task build:macos`
- Build macOS release artifacts (binaries + checksums + release notes):
  - `deno task release:macos`
  - Optional version override: `RELEASE_VERSION=vX.Y.Z deno task release:macos`

## macOS Beta Smoke Check

- Live scheduler smoke test (runs `schedule status/stop/start` against your real launchctl user
  domain):
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler`

Notes:

- The smoke task is intentionally guarded and exits unless `ZEN_BACKUP_LIVE_SMOKE=1` is set.
- If current scheduler jobs are paused before the test, they are left paused.

## Docs

The specs are the source of truth:

- `docs/product/vision.md`
- `docs/product/constitution.md`
- `docs/product/user-stories.md`
- `docs/features/`

## Planned Repo Layout

When implementation begins, expected layout:

- `src/`
- `src/cli/`
- `src/platform/macos/`
- `src/platform/linux/`
- `src/platform/windows/`
- `src/sqlite/`
- `resources/`
- `tests/`

## Contributing

- Follow the Constitution in `docs/product/constitution.md`
- Use conventional commits
- Keep changes scoped and testable
