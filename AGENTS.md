# AGENTS.md

## Purpose
This repo currently contains product specs only. When implementing, keep behavior consistent with the docs in `docs/`.

## Product Summary
Zen Profile Backup is a cross-platform CLI (`zen-backup`) that creates daily/weekly compressed snapshots of a Zen browser profile, supports one-command restore, and integrates with native OS schedulers and notifications. SQLite files must be backed up via SQLite backup APIs (no raw file copy).

## Stack Direction (Expected)
- Language: TypeScript
- Runtime: Node.js
- Output: Single self-contained binary per platform (macOS/Windows/Linux)
- Platform adapters: launchd/systemd/Task Scheduler; osascript/notify-send/PowerShell toast

## Repo Organization (Target Layout)
- `src/`
- `src/cli/`
- `src/platform/macos/`
- `src/platform/linux/`
- `src/platform/windows/`
- `src/sqlite/`
- `resources/`
- `tests/`

## Source of Truth
Use these docs as the primary requirements:
- `docs/product/vision.md`
- `docs/product/constitution.md`
- `docs/product/user-stories.md`
- `docs/features/`

## Quality Bar
- Follow the Constitution: data safety first, fail loudly, restorable by default.
- Keep behavior consistent across platforms, with platform-specific integrations isolated to adapters.
- Prefer explicit precondition checks and clear error messages.

## Commit Guidance
- Use conventional commits (e.g., `docs: ...`, `feat: ...`, `fix: ...`).
- Keep commits small and scoped to a single logical change.
