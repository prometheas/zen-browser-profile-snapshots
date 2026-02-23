# AGENTS.md

## Purpose

This repo currently contains product specs only. When implementing, keep behavior consistent with
the docs in `docs/`.

## Product Summary

Zen Profile Backup is a cross-platform CLI (`zen-backup`) that creates daily/weekly compressed
snapshots of a Zen browser profile, supports one-command restore, and integrates with native OS
schedulers and notifications. SQLite files must be backed up via SQLite backup APIs (no raw file
copy).

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

## Key Skills

CRITICAL: always load and follow the using-superpowers skill.

## Source of Truth

Use these docs as the primary requirements:

- `docs/product/vision.md`
- `docs/product/constitution.md`
- `docs/product/user-stories.md`
- `docs/features/`
- `docs/development/OVERVIEW.md` (developer workflow index)
- `docs/development/TESTING.md` (test creation and execution guidance)
- `docs/command-execution-reference.md` (user-facing command flows and platform mechanism
  disclosure)

When implementation decisions change behavior, update the relevant docs in the same change set:

- `docs/product/user-stories.md`
- affected `docs/features/**/*.feature`
- `docs/command-execution-reference.md`
- any CLI/docs references (for example `README.md`)

Synchronization requirement:

- Keep `docs/command-execution-reference.md` synchronized with `docs/product/user-stories.md` and
  `docs/features/**/*.feature`.
- If command behavior, sequencing, scheduler/notification mechanics, or fallback behavior changes,
  update all three artifacts in the same change.

Story/spec boundary:

- Keep `docs/product/user-stories.md` platform-agnostic (intent, outcomes, acceptance criteria at
  product level).
- Put platform-specific behavior, tool choices, and OS mechanics in
  `docs/features/platform/**/*.feature`.
- If a decision is macOS/Linux/Windows-specific, update the matching platform feature files, not the
  user stories.

## Quality Bar

- Follow the Constitution: data safety first, fail loudly, restorable by default.
- Keep behavior consistent across platforms, with platform-specific integrations isolated to
  adapters.
- Prefer explicit precondition checks and clear error messages.
- When adding/changing tests, follow `docs/development/TESTING.md` for layer selection
  (unit/integration/acceptance), TDD expectations, and required run commands.

## Commit Guidance

- Use conventional commits (e.g., `docs: ...`, `feat: ...`, `fix: ...`).
- Keep commits small and scoped to a single logical change.

## Repository Naming Rules

- Use `lower-kebab-case` for all new file names and directory names.
- Do not use underscores or mixed/upper case in file/directory names.
- Explicit filename exceptions: `AGENTS.md` and `README.md`.
- If renaming paths for this rule, update all imports and file references in the same change.

## Deno Task and Script Naming Rules

- Keep `deno.json` task names in colon form (for example `test:unit`,
  `test:acceptance:platform:macos`).
- Keep complex task logic externalized in `scripts/` instead of long inline task commands.
- Script filenames must stay `lower-kebab-case`; when a script maps to a colon task, replace `:`
  with `--` in the script name.
- Preferred mapping pattern:
  - task: `test:acceptance:*`
  - script: `scripts/task--test-acceptance--rust.ts` (or another focused
    `scripts/task--<task-family>.ts` wrapper)
- When adding/changing tasks, update all references in the same change:
  - `deno.json`
  - CI workflows under `.github/workflows/`
  - docs that show task commands (`README.md`, release checklists, etc.)

## Configuration Files

- Store tool configuration files in `.config/` when the tool supports custom config paths.
- Examples: `.config/.markdownlint.json`
- This keeps the repository root clean and groups configuration in one place.
