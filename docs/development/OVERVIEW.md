# Development Overview

This document is the entry point for contributor and agent-facing development workflows.

## Scope

- environment and tooling expectations
- task naming and task-to-script mapping
- test suite structure and execution guidance
- release and packaging commands

## Environment

- Runtime/tooling: Deno 2
- Optional local environment management: `flake.nix` + `.envrc` (direnv)

## Task Conventions

- `deno.json` task names use colon format:
  - examples: `test:unit`, `test:acceptance:platform:macos`, `release:macos`
- Script file names under `scripts/` stay lower-kebab-case.
- For scripts that implement a colon task family, map `:` to `--`:
  - example task family: `test:acceptance:*`
  - script: `scripts/task--test-acceptance.ts`

## Testing

Read `docs/development/TESTING.md` before adding or modifying tests.

## Key Commands

- Lint:
  - `deno task lint`
  - `deno task lint:markdown`
- Typecheck:
  - `deno task typecheck`
- Unit + integration:
  - `deno task test:unit`
  - `deno task test:integration`
- Acceptance:
  - `deno task test:acceptance`
  - `deno task test:acceptance:platform`
  - `deno task test:acceptance:platform:macos`
  - `deno task test:acceptance:platform:linux`
  - `deno task test:acceptance:platform:windows`
  - `deno task test:acceptance:m1`
- Release build tasks:
  - `deno task release:macos`
  - `deno task release:linux`
- macOS smoke:
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler`

## Release Notes

- Combined release workflow: `.github/workflows/release-combined.yml`
- Combined release notes generator: `scripts/generate-combined-release-notes.ts`
