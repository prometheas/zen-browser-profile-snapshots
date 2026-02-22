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
- Acceptance tests (Gherkin + Cucumber):
  - features: `docs/features/**/*.feature`
  - step definitions: `tests/acceptance/steps/`
  - support/world: `tests/acceptance/support/`
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
- Before macOS beta cut:
  - `deno task test:acceptance:platform:macos`
- Before Linux beta cut:
  - `deno task test:acceptance:platform:linux`
- Before Windows alpha cut:
  - `deno task test:acceptance:platform:windows`
  - `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:windows:scheduler`

## Acceptance Runtime Notes

- Acceptance execution is wrapped by `scripts/task--test-acceptance.ts`.
- Do not copy long raw Cucumber commands unless debugging task-wrapper behavior.
- If a scenario timing issue occurs, adjust step timeout intentionally and keep it scoped.
