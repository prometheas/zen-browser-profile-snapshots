# Linux Beta Checklist

This checklist defines what must pass before cutting a public Linux beta tag.

## Scope

- Target platforms:
  - `x86_64-unknown-linux-gnu`
  - `aarch64-unknown-linux-gnu`
- In-scope features:
  - Core commands (`backup`, `restore`, `list`, `status`)
  - Linux install/uninstall
  - systemd scheduler lifecycle (`install`, `schedule start|stop|status`, aliases)
  - Linux notification behavior (`notify-send` preferred, log fallback)

## Required Validation

Run from repo root:

- `deno task lint`
- `deno task typecheck`
- `deno task test:unit`
- `deno task test:integration`
- `deno run -A npm:@cucumber/cucumber@12.6.0 --import tests/acceptance/support/world.ts --import tests/acceptance/steps/index.ts --tags '@linux' docs/features/platform/install.feature docs/features/platform/scheduling.feature docs/features/platform/notifications.feature`
- `deno task release:linux`

## CI Gate

- `CI Linux` workflow on `ubuntu-24.04` must be green for the release commit/tag.

## Manual QA

- Fresh install path:
  - Run `zen-backup install`
  - Verify `settings.toml` is created and profile path auto-detected.
- Scheduler lifecycle:
  - Verify `zen-backup schedule stop` moves both timers to `paused`.
  - Verify `zen-backup schedule start` moves both timers to `active`.
  - Verify `zen-backup schedule status` reports both timers.
- Uninstall behavior:
  - Verify `zen-backup uninstall` removes config/scheduling and warns backups are kept.
  - Verify `zen-backup uninstall --purge-backups` removes local backup archives.

## Release Outputs

- `dist/zen-backup-x86_64-unknown-linux-gnu`
- `dist/zen-backup-aarch64-unknown-linux-gnu`
- `dist/checksums-linux.txt`
- `dist/release-notes-linux.md`

## Exit Criteria

- All required validation commands pass.
- Linux CI is green on the tagged commit.
- No open P0/P1 Linux defects in current milestone scope.
- Release notes clearly state:
  - included Linux beta behavior
  - known limitations
  - remaining plan for Windows parity
