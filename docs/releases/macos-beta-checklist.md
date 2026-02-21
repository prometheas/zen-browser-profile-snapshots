# macOS Beta Checklist

This checklist defines what must pass before cutting a public macOS beta tag.

## Scope

- Target platforms:
  - `aarch64-apple-darwin`
  - `x86_64-apple-darwin`
- In-scope features:
  - Core commands (`backup`, `restore`, `list`, `status`)
  - macOS install/uninstall
  - launchd scheduler lifecycle (`install`, `schedule start|stop|status`, aliases)
  - macOS notification behavior (`terminal-notifier` preferred, `osascript` fallback)

## Required Validation

Run from repo root:

- `deno task lint`
- `deno task typecheck`
- `deno task test:unit`
- `deno task test:integration`
- `deno run -A npm:@cucumber/cucumber@12.6.0 --import tests/acceptance/support/world.ts --import tests/acceptance/steps/index.ts --tags '@macos' docs/features/platform/install.feature docs/features/platform/scheduling.feature docs/features/platform/notifications.feature`
- `deno task release:macos`

Optional live smoke on a macOS host:

- `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler`

## Manual QA

- Fresh install path:
  - Run `zen-backup install`
  - Verify `settings.toml` is created and profile path auto-detected
- Scheduler lifecycle:
  - Verify `zen-backup schedule stop` moves both jobs to `paused`
  - Verify `zen-backup schedule start` moves both jobs to `active`
  - Verify `zen-backup schedule status` reports both `com.prometheas.*` labels
- Uninstall behavior:
  - Verify `zen-backup uninstall` removes config/scheduling and warns backups are kept
  - Verify `zen-backup uninstall --purge-backups` removes local backup archives

## Release Outputs

- `dist/zen-backup-aarch64-apple-darwin`
- `dist/zen-backup-x86_64-apple-darwin`
- `dist/checksums-macos.txt`
- `dist/release-notes-macos.md`

## Exit Criteria

- All required validation commands pass.
- No open P0/P1 defects for macOS in current milestone scope.
- Release notes clearly state:
  - included macOS beta behavior
  - known limitations
  - post-beta plan (Linux/Windows parity remains Milestone 2)
