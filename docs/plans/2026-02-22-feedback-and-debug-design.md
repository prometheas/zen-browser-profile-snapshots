# Feedback and Debug Design

## Summary

Add a `feedback` subcommand for bug and request submission, with a native CLI prompt flow and
transport via GitHub CLI when available. When GitHub CLI is unavailable, open the repository issue
creation page in the user's system browser with the selected issue template.

Add global debug flags for all commands:

- `--debug` enables debug logging to `stderr`.
- `--log-file [path]` writes the same debug stream to a file.
- When `--log-file` is provided without a value, default to `zen-backup-debug.log` in the current
  working directory.

## Goals

- Make feedback submission discoverable and low-friction from the CLI.
- Keep behavior consistent across macOS, Linux, and Windows.
- Preserve robust non-interactive behavior by failing loudly with actionable messages.
- Keep debug behavior orthogonal and global so it applies to every command and execution path.

## Non-Goals

- Building a full-screen TUI framework in this milestone.
- Submitting issues through direct GitHub HTTP API calls.
- Collecting telemetry automatically.

## UX and Command Surface

### Commands

- `zen-backup feedback bug`
- `zen-backup feedback request`

### Global flags

- `zen-backup --debug ...`
- `zen-backup --debug --log-file ...`
- `zen-backup --debug --log-file custom.log ...`

### Feedback flow

1. Validate subtype (`bug` or `request`).
2. Prompt user for required fields.
3. Detect `gh` availability.
4. If `gh` exists:
   - Create issue with title/body/labels via `gh issue create`.
   - Print created issue URL on success.
5. If `gh` missing:
   - Build template URL (`bug-report.yml` or `feature-request.yml`) for repository issues/new.
   - Open URL using platform browser launcher.

## Architecture

### New modules

- `src/cli/global-options.ts`
  - Parse and strip global flags from argv before command dispatch.
- `src/debug/logger.ts`
  - Central debug logger that writes to `stderr` and optional file sink.
- `src/commands/feedback.ts`
  - Orchestrates feedback command lifecycle.
- `src/platform/browser.ts`
  - Cross-platform URL opening adapter.
- `src/platform/github-cli.ts`
  - `gh` availability check and issue creation wrapper.

### Existing modules to modify

- `src/main.ts`
  - Apply global option parsing before command routing.
  - Inject debug logger into runtime options.
  - Add `feedback` command route + help routing.
- `src/cli/help.ts`
  - Add `feedback` command docs and global debug flag docs.
- `src/types.ts`
  - Extend `RuntimeOptions` for debug settings/logger hooks.

### Templates

- `.github/ISSUE_TEMPLATE/bug-report.yml`
- `.github/ISSUE_TEMPLATE/feature-request.yml`

## Error Handling

- Invalid feedback type: exit `1` with command help.
- Interactive prompt failure (EOF/permission): exit `1` with concise message.
- `gh` create failure:
  - If executable exists but command fails, report stderr output.
  - Offer fallback URL open path.
- Browser launcher failure: exit `1` with explicit URL printed for manual open.

## Security and Data Handling

- Debug logs may include command args and execution traces; avoid writing secrets unless explicitly
  needed.
- Feedback body fields are user-provided and treated as plain text only.

## Test Strategy

- Unit tests:
  - Global option parsing (`--debug`, `--log-file` with/without value, mixed order).
  - Debug logger dual sink behavior.
  - Feedback issue body and label mapping.
- Integration tests:
  - Feedback command with mocked `gh` present path.
  - Feedback command fallback browser-open path when `gh` absent.
  - Global debug flags produce stderr and optional log file output.
- Acceptance tests:
  - Add `docs/features/core/feedback.feature` scenarios for bug and request paths.

## Documentation Changes

- `README.md`: user-facing feedback command and debug flags.
- `docs/development/OVERVIEW.md`: command/task references if task wrappers are added.
- `docs/development/TESTING.md`: include new acceptance scenarios and targeted run guidance.
- `docs/features/core/feedback.feature`: source of truth for user-visible behavior.

## Rollout

1. Add issue templates first.
2. Implement global flag parsing and debug logger.
3. Implement feedback command with `gh` path.
4. Add browser fallback path.
5. Complete docs and acceptance alignment in same change sets.
