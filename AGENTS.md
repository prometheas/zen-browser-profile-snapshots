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

When implementation decisions change behavior, update the relevant docs in the same change set:

- `docs/product/user-stories.md`
- affected `docs/features/**/*.feature`
- any CLI/docs references (for example `README.md`)

Story/spec boundary:

- Keep `docs/product/user-stories.md` platform-agnostic (intent, outcomes, acceptance criteria at product level).
- Put platform-specific behavior, tool choices, and OS mechanics in `docs/features/platform/**/*.feature`.
- If a decision is macOS/Linux/Windows-specific, update the matching platform feature files, not the user stories.

## Quality Bar

- Follow the Constitution: data safety first, fail loudly, restorable by default.
- Keep behavior consistent across platforms, with platform-specific integrations isolated to adapters.
- Prefer explicit precondition checks and clear error messages.

## Commit Guidance

- Use conventional commits (e.g., `docs: ...`, `feat: ...`, `fix: ...`).
- Keep commits small and scoped to a single logical change.

## Repository Naming Rules

- Use `lower-kebab-case` for all new file names and directory names.
- Do not use underscores or mixed/upper case in file/directory names.
- Explicit filename exceptions: `AGENTS.md` and `README.md`.
- If renaming paths for this rule, update all imports and file references in the same change.
