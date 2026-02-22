# Feedback and Debug Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task.

**Goal:** Add `feedback` command support (bug/request) with `gh` transport + browser fallback, plus
global `--debug` and optional `--log-file` for all commands.

**Architecture:** Parse global flags once in CLI entry and inject debug context into runtime
options. Implement feedback as a dedicated command that collects inputs, then either creates issues
with `gh` or opens the browser to the matching issue template URL. Keep platform-specific process
launching in adapters so behavior remains testable and consistent across macOS/Linux/Windows.

**Tech Stack:** TypeScript, Deno 2, std/path, existing command adapter pattern, Cucumber acceptance
tests, Deno unit/integration tests.

---

**Execution skills to apply:** `@test-driven-development`, `@verification-before-completion`

### Task 1: Add failing acceptance coverage for feedback command

**Files:**

- Create: `docs/features/core/feedback.feature`
- Modify: `tests/acceptance/steps/index.ts`
- Create: `tests/acceptance/steps/feedback-steps.ts`

**Step 1: Write failing acceptance scenarios**

```gherkin
Feature: Feedback submission
  Scenario: Submit bug feedback via gh
  Scenario: Submit request feedback via gh
  Scenario: Fallback to browser when gh is unavailable
```

**Step 2: Run acceptance subset to verify failure**

Run: `deno run -A scripts/task--test-acceptance.ts all` Expected: FAIL with undefined feedback
steps/unknown command.

**Step 3: Add minimal step definitions stubs**

- Add world wiring and placeholders that still fail on expected command behavior.

**Step 4: Re-run acceptance to verify controlled failure**

Run: `deno run -A scripts/task--test-acceptance.ts all` Expected: FAIL specifically on feedback
command output assertions.

**Step 5: Commit**

```bash
git add docs/features/core/feedback.feature tests/acceptance/steps/index.ts tests/acceptance/steps/feedback-steps.ts
git commit -m "test(acceptance): add feedback command scenarios"
```

### Task 2: Add failing unit tests for global debug flag parsing

**Files:**

- Create: `src/cli/global-options.ts`
- Create: `tests/unit/global-options-test.ts`
- Modify: `src/types.ts`

**Step 1: Write failing unit tests**

```ts
Deno.test("parses --debug and strips it from command args", ...)
Deno.test("parses --log-file with explicit path", ...)
Deno.test("uses default log filename when --log-file has no value", ...)
```

**Step 2: Run unit test to verify failure**

Run: `deno test -A tests/unit/global-options-test.ts` Expected: FAIL because parser does not exist.

**Step 3: Implement minimal parser and runtime types**

- Return `{ commandArgs, debugEnabled, logFilePath }`.
- Preserve arg order for command args.

**Step 4: Re-run unit test**

Run: `deno test -A tests/unit/global-options-test.ts` Expected: PASS.

**Step 5: Commit**

```bash
git add src/cli/global-options.ts src/types.ts tests/unit/global-options-test.ts
git commit -m "feat(cli): parse global debug options"
```

### Task 3: Add failing unit tests for debug logger sinks

**Files:**

- Create: `src/debug/logger.ts`
- Create: `tests/unit/debug-logger-test.ts`

**Step 1: Write failing tests for stderr and file sinks**

```ts
Deno.test("debug logger writes to stderr when enabled", ...)
Deno.test("debug logger writes to file when log path configured", ...)
```

**Step 2: Run test to verify failure**

Run: `deno test -A tests/unit/debug-logger-test.ts` Expected: FAIL (module/functions missing).

**Step 3: Implement minimal logger**

- API: `createDebugLogger(options)` with `debug(message)`.
- Writes timestamped lines to stderr.
- Appends same line to file when configured.

**Step 4: Re-run tests**

Run: `deno test -A tests/unit/debug-logger-test.ts` Expected: PASS.

**Step 5: Commit**

```bash
git add src/debug/logger.ts tests/unit/debug-logger-test.ts
git commit -m "feat(debug): add stderr and file debug logger"
```

### Task 4: Add feedback command unit tests and implement core feedback command

**Files:**

- Create: `src/commands/feedback.ts`
- Create: `src/platform/github-cli.ts`
- Create: `tests/unit/feedback-command-test.ts`

**Step 1: Write failing tests**

```ts
Deno.test("feedback bug builds bug-labeled issue payload", ...)
Deno.test("feedback request builds enhancement-labeled issue payload", ...)
Deno.test("invalid feedback subtype exits with help guidance", ...)
```

**Step 2: Run tests to verify failure**

Run: `deno test -A tests/unit/feedback-command-test.ts` Expected: FAIL due to missing command.

**Step 3: Implement minimal feedback command orchestration**

- Accept `bug|request`.
- Gather prompt fields.
- Call `github-cli` adapter for create path.
- Return command result arrays.

**Step 4: Re-run tests**

Run: `deno test -A tests/unit/feedback-command-test.ts` Expected: PASS.

**Step 5: Commit**

```bash
git add src/commands/feedback.ts src/platform/github-cli.ts tests/unit/feedback-command-test.ts
git commit -m "feat(feedback): add bug and request submission command"
```

### Task 5: Add browser fallback adapter with tests

**Files:**

- Create: `src/platform/browser.ts`
- Create: `tests/unit/browser-open-test.ts`
- Modify: `src/commands/feedback.ts`

**Step 1: Write failing tests**

```ts
Deno.test("opens bug template URL when gh unavailable", ...)
Deno.test("opens feature template URL when gh unavailable", ...)
Deno.test("prints manual URL when open command fails", ...)
```

**Step 2: Run tests to verify failure**

Run: `deno test -A tests/unit/browser-open-test.ts tests/unit/feedback-command-test.ts` Expected:
FAIL for missing fallback behavior.

**Step 3: Implement minimal cross-platform opener adapter**

- macOS: `open`
- Linux: `xdg-open`
- Windows: `cmd /c start`

**Step 4: Re-run tests**

Run: `deno test -A tests/unit/browser-open-test.ts tests/unit/feedback-command-test.ts` Expected:
PASS.

**Step 5: Commit**

```bash
git add src/platform/browser.ts src/commands/feedback.ts tests/unit/browser-open-test.ts tests/unit/feedback-command-test.ts
git commit -m "feat(feedback): add browser fallback when gh is unavailable"
```

### Task 6: Wire global options and feedback command into CLI routing/help

**Files:**

- Modify: `src/main.ts`
- Modify: `src/cli/help.ts`
- Modify: `tests/unit/cli-help-test.ts`

**Step 1: Write failing CLI unit tests**

```ts
Deno.test("root help lists feedback command and debug flags", ...)
Deno.test("feedback --help renders usage", ...)
Deno.test("global debug flags are accepted before command", ...)
```

**Step 2: Run tests to verify failure**

Run: `deno test -A tests/unit/cli-help-test.ts` Expected: FAIL for missing entries/parse behavior.

**Step 3: Implement minimal routing changes**

- Parse global options first.
- Initialize debug logger.
- Add `feedback` dispatch and command help topic.

**Step 4: Re-run tests**

Run: `deno test -A tests/unit/cli-help-test.ts` Expected: PASS.

**Step 5: Commit**

```bash
git add src/main.ts src/cli/help.ts tests/unit/cli-help-test.ts
git commit -m "feat(cli): wire feedback command and global debug flags"
```

### Task 7: Add integration coverage for gh path and browser fallback

**Files:**

- Modify: `tests/integration/platform-cli-test.ts`
- Create: `tests/integration/feedback-cli-test.ts`

**Step 1: Write failing integration tests**

```ts
Deno.test("feedback bug uses gh issue create when gh available", ...)
Deno.test("feedback request opens browser URL when gh unavailable", ...)
Deno.test("--debug with --log-file writes debug file and stderr", ...)
```

**Step 2: Run integration tests to verify failure**

Run: `deno test -A tests/integration/feedback-cli-test.ts` Expected: FAIL for missing behavior.

**Step 3: Implement minimal wiring for process invocation mocks**

- Reuse runtime env/process abstraction patterns from scheduler tests.

**Step 4: Re-run integration tests**

Run: `deno test -A tests/integration/feedback-cli-test.ts` Expected: PASS.

**Step 5: Commit**

```bash
git add tests/integration/feedback-cli-test.ts tests/integration/platform-cli-test.ts
git commit -m "test(integration): cover feedback gh and browser fallback flows"
```

### Task 8: Add GitHub issue templates and documentation

**Files:**

- Create: `.github/ISSUE_TEMPLATE/bug-report.yml`
- Create: `.github/ISSUE_TEMPLATE/feature-request.yml`
- Modify: `README.md`
- Modify: `docs/development/OVERVIEW.md`
- Modify: `docs/development/TESTING.md`

**Step 1: Add templates and docs updates**

- Keep user story platform-agnostic; place any platform mechanics in features/tests/docs.

**Step 2: Run markdown lint and targeted checks**

Run: `deno task lint:markdown` Expected: PASS.

**Step 3: Commit**

```bash
git add .github/ISSUE_TEMPLATE/bug-report.yml .github/ISSUE_TEMPLATE/feature-request.yml README.md docs/development/OVERVIEW.md docs/development/TESTING.md
git commit -m "docs(feedback): add issue templates and feedback command docs"
```

### Task 9: Final verification before merge/release

**Files:**

- Modify if needed: any files touched by fixes from verification

**Step 1: Run full local verification**

Run: `deno task lint && deno task typecheck && deno task test:unit && deno task test:integration`
Expected: PASS.

**Step 2: Run acceptance suites including feedback**

Run: `deno run -A scripts/task--test-acceptance.ts all` Expected: PASS for active scenarios.

**Step 3: Optional platform smoke checks**

Run: `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:macos:scheduler` Expected: PASS or explicit skip
message when jobs are not installed.

Run: `ZEN_BACKUP_LIVE_SMOKE=1 deno task test:smoke:windows:scheduler` Expected: PASS on Windows
runner.

**Step 4: Commit any final fixes**

```bash
git add <adjusted-files>
git commit -m "fix(feedback): address verification findings"
```
