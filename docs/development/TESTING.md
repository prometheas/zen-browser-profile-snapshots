# Testing Guide

Use this guide when creating tests, choosing test scope, and running validation.

## Test Layers

- Unit tests:
  - location: `tests/unit/`
  - purpose: pure logic and formatting/parsing behavior
  - fast feedback, no cross-component orchestration
- Integration tests:
  - location: `tests/integration/`
  - purpose: command behavior across filesystem/config/platform adapters
  - validates realistic workflows in temporary sandboxes
- Acceptance tests (Gherkin + cucumber-rs):
  - features: `docs/features/**/*.feature`
  - rust harness: `rust/zen-backup/tests/acceptance-rust-test.rs`
  - runner wrapper: `scripts/task--test-acceptance--rust.ts`
  - purpose: user-story and scenario-level behavior verification

## When to Add Which Test

- Add/adjust unit tests when:
  - you change pure logic (formatting, parsing, retention math, version parsing, helpers)
- Add/adjust integration tests when:
  - you change CLI command behavior, config wiring, filesystem workflows, archive flows
- Add/adjust acceptance tests when:
  - user-visible behavior in feature scenarios changes
  - platform-specific behavior changes (`@macos`, `@linux`, `@windows`)

## TDD Rule

- Start from failing scenario/expectation first.
- Add the smallest failing test at the right layer.
- Implement minimal fix.
- Refactor with all relevant suites green.

## Commands

- Unit:
  - `deno task test:unit`
- Integration:
  - `deno task test:integration`
- Acceptance (all):
  - `deno task test:acceptance`
- Acceptance (explicit rust alias):
  - `deno task test:acceptance:rust`
- Acceptance (platform):
  - `deno task test:acceptance:platform`
  - `deno task test:acceptance:platform:macos`
  - `deno task test:acceptance:platform:linux`
  - `deno task test:acceptance:platform:windows`
- Milestone 1 acceptance subset:
  - `deno task test:acceptance:m1`
- Native scheduler smoke tests:
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler`
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:windows:scheduler`

## Recommended Run Order

- Typical local dev:
  - `deno task test:unit`
  - `deno task test:integration`
- Before PR / merge:
  - `deno task lint`
  - `deno task typecheck`
  - `deno task test:unit`
  - `deno task test:integration`
  - relevant acceptance subset for your platform/scope
  - when feedback/debug behavior changes:
    - `deno test -A tests/unit/feedback-command-test.ts tests/unit/browser-open-test.ts tests/unit/global-options-test.ts tests/unit/debug-logger-test.ts`
    - `deno test -A tests/integration/feedback-cli-test.ts`
- Before macOS beta cut:
  - `deno task test:acceptance:platform:macos`
- Before Linux beta cut:
  - `deno task test:acceptance:platform:linux`
- Before Windows alpha cut:
  - `deno task test:acceptance:platform:windows`
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:windows:scheduler`

## Acceptance Runtime Notes

- Acceptance execution is wrapped by `scripts/task--test-acceptance--rust.ts`.
- `test:acceptance`, `test:acceptance:m1`, and platform-tagged acceptance tasks are aliases to the
  rust acceptance suite.
- Do not copy long raw Cucumber commands unless debugging task-wrapper behavior.
- If a scenario timing issue occurs, adjust step timeout intentionally and keep it scoped.

## Runtime Selection Notes

- `runCli()` uses the Rust runtime path by default.
- Set `ZEN_BACKUP_RUST_CLI_BIN` to override the Rust binary path used by bridge tests.
