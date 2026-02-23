# Rust CLI Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan
> task-by-task.

**Goal:** Migrate the `zen-backup` runtime from Deno/TypeScript to Rust while preserving behavior
and keeping existing Gherkin-driven acceptance coverage as the primary product contract.

**Architecture:** Use a strangler migration. Keep Deno test harness and Cucumber steps initially,
but route `runCli()` through a Rust binary via a stable bridge contract. Port command behavior to
Rust in vertical slices, then remove TypeScript runtime code once parity is proven.

**Tech Stack:** Rust (`clap`, `serde`, `toml`, `tar`, `flate2`, `rusqlite`, `chrono`), Deno
(acceptance/integration harness + scripts), GitHub Actions, Nix/direnv.

---

## Assumption Check (Locked)

- **Correct:** We can keep most existing acceptance + integration test code if we preserve
  `runCli(args, options)` semantics.
- **Not fully correct:** We cannot keep all current TypeScript unit tests unchanged, because many
  assert TypeScript internals that will move into Rust.
- **Decision:** Preserve Gherkin + black-box CLI tests first; migrate internals-focused unit tests
  to Rust unit tests as each module is ported.

---

### Task 1: Bootstrap Rust Workspace and Tooling

**Files:**

- Create: `Cargo.toml`
- Create: `rust/zen-backup/Cargo.toml`
- Create: `rust/zen-backup/src/main.rs`
- Create: `rust/zen-backup/src/lib.rs`
- Create: `rust/zen-backup/tests/smoke-cli-test.rs`
- Modify: `flake.nix`
- Modify: `docs/development/OVERVIEW.md`

**Step 1: Write the failing Rust smoke test**

```rust
#[test]
fn prints_version_with_flag() {
    let out = std::process::Command::new(env!("CARGO_BIN_EXE_zen-backup"))
        .arg("--version")
        .output()
        .unwrap();
    assert!(out.status.success());
}
```

**Step 2: Run the smoke test to verify failure**

Run: `cargo test -p zen-backup smoke-cli-test -- --nocapture`\
Expected: FAIL because crate/binary does not exist yet.

**Step 3: Add Cargo workspace and crate skeleton**

Add root workspace and `zen-backup` package with `edition = "2021"`.

**Step 4: Implement minimal binary output**

Implement `main.rs` returning fixed help/version placeholders.

**Step 5: Re-run smoke test**

Run: `cargo test -p zen-backup smoke-cli-test -- --nocapture`\
Expected: PASS.

**Step 6: Add Nix shell Rust dependencies**

Add `rustc`, `cargo`, `clippy`, `rustfmt`, and optionally `cargo-nextest` in `flake.nix`.

**Step 7: Update development docs**

Document Rust bootstrap commands in `docs/development/OVERVIEW.md`.

**Step 8: Commit**

```bash
git add Cargo.toml rust/zen-backup flake.nix docs/development/OVERVIEW.md
git commit -m "feat(rust): bootstrap workspace and smoke test"
```

Skill focus: `@test-driven-development`

---

### Task 2: Add TypeScript-to-Rust CLI Bridge Contract

**Files:**

- Create: `src/bridge/rust-cli.ts`
- Modify: `src/main.ts`
- Create: `tests/integration/rust-cli-bridge-test.ts`
- Modify: `src/types.ts`

**Step 1: Write a failing bridge integration test**

Test case: `runCli(["status"], options)` shells out to a configured executable and captures
`stdout`, `stderr`, `exitCode`.

**Step 2: Run only the new failing test**

Run: `deno test -A tests/integration/rust-cli-bridge-test.ts`\
Expected: FAIL because bridge does not exist.

**Step 3: Implement minimal `src/bridge/rust-cli.ts`**

```ts
export async function runRustCli(args: string[], opts: RuntimeOptions): Promise<CliResult> {
  // spawn binary, capture output, return CliResult
}
```

**Step 4: Route `runCli()` through bridge behind opt-in env**

Use `ZEN_BACKUP_USE_RUST_CLI=1` to select Rust path first.

**Step 5: Re-run bridge test**

Run: `deno test -A tests/integration/rust-cli-bridge-test.ts`\
Expected: PASS.

**Step 6: Commit**

```bash
git add src/bridge/rust-cli.ts src/main.ts src/types.ts tests/integration/rust-cli-bridge-test.ts
git commit -m "feat(bridge): add runCli rust process adapter"
```

Skill focus: `@test-driven-development`

---

### Task 3: Preserve RuntimeOptions Semantics Through Bridge

**Files:**

- Modify: `src/bridge/rust-cli.ts`
- Create: `rust/zen-backup/src/test-mode.rs`
- Modify: `rust/zen-backup/src/main.rs`
- Modify: `tests/integration/rust-cli-bridge-test.ts`

**Step 1: Write failing test for options mapping**

Verify `RuntimeOptions` fields are bridged:

- `os` -> `ZEN_BACKUP_TEST_OS`
- `now` -> `ZEN_BACKUP_TEST_NOW`
- `version` -> `ZEN_BACKUP_TEST_VERSION`
- `env` merged/overridden correctly
- `cwd` applied to spawned process

**Step 2: Run failing test**

Run: `deno test -A tests/integration/rust-cli-bridge-test.ts`\
Expected: FAIL on missing env mapping.

**Step 3: Implement env mapping in bridge**

Map deterministic test overrides from TypeScript options to process env.

**Step 4: Implement Rust test-mode reader**

Create helper that reads test overrides and exposes runtime context.

**Step 5: Re-run test**

Run: `deno test -A tests/integration/rust-cli-bridge-test.ts`\
Expected: PASS.

**Step 6: Commit**

```bash
git add src/bridge/rust-cli.ts rust/zen-backup/src/test-mode.rs rust/zen-backup/src/main.rs tests/integration/rust-cli-bridge-test.ts
git commit -m "feat(bridge): map runtime options into rust test-mode env"
```

Skill focus: `@test-driven-development`

---

### Task 4: Port Command Routing + Help/Version Parity in Rust

**Files:**

- Create: `rust/zen-backup/src/cli/mod.rs`
- Create: `rust/zen-backup/src/cli/help.rs`
- Create: `rust/zen-backup/src/cli/version.rs`
- Modify: `rust/zen-backup/src/main.rs`
- Modify: `tests/unit/cli-help-test.ts`

**Step 1: Enable bridge by default in tests**

Set `ZEN_BACKUP_USE_RUST_CLI=1` in test launch context for `cli-help-test.ts`.

**Step 2: Run focused test and capture failures**

Run: `deno test -A tests/unit/cli-help-test.ts`\
Expected: FAIL on formatting/exit parity.

**Step 3: Implement Rust argument parsing**

Implement support for:

- global `-h/--help`
- global `-v/--version`
- unknown command handling
- subcommand help dispatch

**Step 4: Implement version rendering parity**

Replicate preview rendering contract currently asserted in `tests/unit/cli-help-test.ts`.

**Step 5: Re-run focused test**

Run: `deno test -A tests/unit/cli-help-test.ts`\
Expected: PASS.

**Step 6: Commit**

```bash
git add rust/zen-backup/src/cli rust/zen-backup/src/main.rs tests/unit/cli-help-test.ts
git commit -m "feat(rust-cli): port command routing and help/version parity"
```

Skill focus: `@test-driven-development`

---

### Task 5: Port Config + Status + List (First Functional Slice)

**Files:**

- Create: `rust/zen-backup/src/config/mod.rs`
- Create: `rust/zen-backup/src/commands/status.rs`
- Create: `rust/zen-backup/src/commands/list.rs`
- Create: `rust/zen-backup/src/commands/mod.rs`
- Modify: `rust/zen-backup/src/main.rs`
- Modify: `tests/integration/status-cli-test.ts`
- Modify: `tests/integration/list-cli-test.ts`
- Modify: `tests/acceptance/steps/status-steps.ts`
- Modify: `tests/acceptance/steps/list-steps.ts`

**Step 1: Run status/list integration tests and observe failures**

Run: `deno test -A tests/integration/status-cli-test.ts tests/integration/list-cli-test.ts`\
Expected: FAIL due to missing command behavior.

**Step 2: Implement Rust config loading**

Replicate config path rules and defaults currently in `src/config.ts`.

**Step 3: Implement Rust `status` command**

Match string output semantics validated by `status-cli-test.ts`.

**Step 4: Implement Rust `list` command**

Match ordering/formatting semantics validated by `list-cli-test.ts`.

**Step 5: Re-run integration tests**

Run: `deno test -A tests/integration/status-cli-test.ts tests/integration/list-cli-test.ts`\
Expected: PASS.

**Step 6: Re-run matching acceptance scenarios**

Run: `deno run -A scripts/task--test-acceptance.ts m1`\
Expected: PASS for status/list scenarios.

**Step 7: Commit**

```bash
git add rust/zen-backup/src/config rust/zen-backup/src/commands tests/integration/status-cli-test.ts tests/integration/list-cli-test.ts tests/acceptance/steps/status-steps.ts tests/acceptance/steps/list-steps.ts
git commit -m "feat(rust-cli): port config status and list commands"
```

Skill focus: `@test-driven-development`

---

### Task 6: Port Backup (Archive + SQLite + Retention + Cloud Semantics)

**Files:**

- Create: `rust/zen-backup/src/commands/backup.rs`
- Create: `rust/zen-backup/src/archive/mod.rs`
- Create: `rust/zen-backup/src/sqlite/mod.rs`
- Create: `rust/zen-backup/src/retention/mod.rs`
- Create: `rust/zen-backup/src/logging/mod.rs`
- Modify: `rust/zen-backup/src/commands/mod.rs`
- Modify: `tests/integration/backup-cli-test.ts`
- Modify: `tests/acceptance/steps/backup-steps.ts`
- Modify: `tests/acceptance/steps/retention-steps.ts`

**Step 1: Run backup integration suite and capture baseline failures**

Run: `deno test -A tests/integration/backup-cli-test.ts`\
Expected: FAIL on unimplemented backup behavior.

**Step 2: Implement daily/weekly archive creation + naming**

Match path/name semantics from current tests.

**Step 3: Implement include/exclude rules and logging**

Match coverage/exclusion behavior and log entries.

**Step 4: Implement SQLite backup API path**

Use `rusqlite` backup API (no raw copy for primary path); preserve fallback semantics required by
scenarios.

**Step 5: Implement retention pruning and cloud copy behavior**

Match partial-failure contract (local success + cloud failure handling).

**Step 6: Re-run backup integration tests**

Run: `deno test -A tests/integration/backup-cli-test.ts`\
Expected: PASS.

**Step 7: Re-run core acceptance backup/retention scenarios**

Run: `deno run -A scripts/task--test-acceptance.ts all`\
Expected: backup + retention scenarios PASS.

**Step 8: Commit**

```bash
git add rust/zen-backup/src/commands/backup.rs rust/zen-backup/src/archive rust/zen-backup/src/sqlite rust/zen-backup/src/retention rust/zen-backup/src/logging tests/integration/backup-cli-test.ts tests/acceptance/steps/backup-steps.ts tests/acceptance/steps/retention-steps.ts
git commit -m "feat(rust-cli): port backup sqlite and retention flows"
```

Skill focus: `@test-driven-development`

---

### Task 7: Port Restore Command + Extraction Safety

**Files:**

- Create: `rust/zen-backup/src/commands/restore.rs`
- Modify: `rust/zen-backup/src/archive/mod.rs`
- Modify: `rust/zen-backup/src/commands/mod.rs`
- Modify: `tests/integration/restore-cli-test.ts`
- Modify: `tests/acceptance/steps/restore-steps.ts`

**Step 1: Run restore integration tests**

Run: `deno test -A tests/integration/restore-cli-test.ts`\
Expected: FAIL on missing restore behavior.

**Step 2: Implement restore flow**

Implement archive lookup, pre-restore backup directory, extraction, and replacement behavior.

**Step 3: Implement safety checks**

Reject absolute/traversal extraction paths and preserve profile on archive corruption.

**Step 4: Re-run restore integration tests**

Run: `deno test -A tests/integration/restore-cli-test.ts`\
Expected: PASS.

**Step 5: Re-run restore acceptance feature**

Run: `deno run -A scripts/task--test-acceptance.ts all`\
Expected: restore scenarios PASS.

**Step 6: Commit**

```bash
git add rust/zen-backup/src/commands/restore.rs rust/zen-backup/src/archive/mod.rs rust/zen-backup/src/commands/mod.rs tests/integration/restore-cli-test.ts tests/acceptance/steps/restore-steps.ts
git commit -m "feat(rust-cli): port restore command and extraction safety"
```

Skill focus: `@test-driven-development`

---

### Task 8: Port Platform Commands (Install/Uninstall/Schedule/Notifications)

**Files:**

- Create: `rust/zen-backup/src/platform/mod.rs`
- Create: `rust/zen-backup/src/platform/macos.rs`
- Create: `rust/zen-backup/src/platform/linux.rs`
- Create: `rust/zen-backup/src/platform/windows.rs`
- Create: `rust/zen-backup/src/commands/install.rs`
- Create: `rust/zen-backup/src/commands/uninstall.rs`
- Create: `rust/zen-backup/src/commands/schedule.rs`
- Modify: `tests/integration/platform-cli-test.ts`
- Modify: `tests/acceptance/steps/platform-steps.ts`

**Step 1: Run platform integration tests**

Run: `deno test -A tests/integration/platform-cli-test.ts`\
Expected: FAIL on unimplemented commands.

**Step 2: Implement install/uninstall**

Preserve current behavior including `--purge-backups` semantics and messaging.

**Step 3: Implement schedule lifecycle**

Support `start|resume|stop|pause|status` with alias parity.

**Step 4: Implement per-OS adapters**

Shell out to `launchctl`, `systemctl --user`, `schtasks` and keep simulation env compatibility used
by tests.

**Step 5: Implement notification adapter behavior**

Preserve current fallback chain and logging semantics.

**Step 6: Re-run integration + platform acceptance**

Run: `deno test -A tests/integration/platform-cli-test.ts`\
Run: `deno run -A scripts/task--test-acceptance.ts platform`\
Expected: PASS.

**Step 7: Commit**

```bash
git add rust/zen-backup/src/platform rust/zen-backup/src/commands/install.rs rust/zen-backup/src/commands/uninstall.rs rust/zen-backup/src/commands/schedule.rs tests/integration/platform-cli-test.ts tests/acceptance/steps/platform-steps.ts
git commit -m "feat(rust-cli): port platform install uninstall schedule flows"
```

Skill focus: `@test-driven-development`

---

### Task 9: Port Feedback + Debug Flags and Logging

**Files:**

- Create: `rust/zen-backup/src/commands/feedback.rs`
- Create: `rust/zen-backup/src/debug/mod.rs`
- Modify: `rust/zen-backup/src/cli/mod.rs`
- Modify: `tests/unit/feedback-command-test.ts`
- Modify: `tests/integration/feedback-cli-test.ts`
- Modify: `tests/acceptance/steps/feedback-steps.ts`

**Step 1: Run feedback/debug tests**

Run: `deno test -A tests/unit/feedback-command-test.ts tests/integration/feedback-cli-test.ts`\
Expected: FAIL on unimplemented command/options.

**Step 2: Implement global debug flags in Rust**

Support `--debug` and `--log-file` with stderr + file output parity.

**Step 3: Implement feedback transport**

Preserve `gh` transport preference and browser fallback behavior.

**Step 4: Re-run feedback tests**

Run: `deno test -A tests/unit/feedback-command-test.ts tests/integration/feedback-cli-test.ts`\
Expected: PASS.

**Step 5: Re-run feedback acceptance scenarios**

Run: `deno run -A scripts/task--test-acceptance.ts all`\
Expected: feedback scenarios PASS.

**Step 6: Commit**

```bash
git add rust/zen-backup/src/commands/feedback.rs rust/zen-backup/src/debug/mod.rs rust/zen-backup/src/cli/mod.rs tests/unit/feedback-command-test.ts tests/integration/feedback-cli-test.ts tests/acceptance/steps/feedback-steps.ts
git commit -m "feat(rust-cli): port feedback command and debug logging"
```

Skill focus: `@test-driven-development`

---

### Task 10: Make Rust Binary the Default Runtime and Keep Test Harness

**Files:**

- Modify: `src/main.ts`
- Modify: `src/bridge/rust-cli.ts`
- Modify: `deno.json`
- Modify: `docs/development/TESTING.md`

**Step 1: Write failing integration test for default runtime path**

Ensure `runCli()` uses Rust path by default and legacy TS path is opt-in fallback during transition.

**Step 2: Run failing test**

Run: `deno test -A tests/integration/rust-cli-bridge-test.ts`\
Expected: FAIL on default runtime assertion.

**Step 3: Switch default to Rust binary**

Use `ZEN_BACKUP_USE_TS_CLI=1` as temporary fallback gate.

**Step 4: Re-run bridge and full unit+integration suites**

Run: `deno task test:unit`\
Run: `deno task test:integration`\
Expected: PASS.

**Step 5: Commit**

```bash
git add src/main.ts src/bridge/rust-cli.ts deno.json docs/development/TESTING.md
git commit -m "refactor(runtime): make rust cli default through runCli bridge"
```

Skill focus: `@test-driven-development`

---

### Task 11: Release Pipeline Migration (Deno Compile -> Cargo Build)

**Files:**

- Modify: `scripts/build-target.ts`
- Modify: `scripts/task--release-macos.ts`
- Modify: `scripts/task--release-linux.ts`
- Modify: `scripts/task--release-windows.ts`
- Modify: `.github/workflows/release-combined.yml`
- Modify: `.github/workflows/ci-linux.yml`
- Modify: `.github/workflows/ci-windows.yml`
- Modify: `README.md`
- Modify: `docs/development/OVERVIEW.md`

**Step 1: Write failing release-artifact test for Rust build path**

Extend `tests/unit/release-artifacts-test.ts` to validate expected binary naming unchanged.

**Step 2: Run failing test**

Run: `deno test -A tests/unit/release-artifacts-test.ts`\
Expected: FAIL on old build assumptions.

**Step 3: Swap build scripts to Cargo target builds**

Keep artifact names exactly:

- `zen-backup-aarch64-apple-darwin`
- `zen-backup-x86_64-apple-darwin`
- `zen-backup-x86_64-unknown-linux-gnu`
- `zen-backup-aarch64-unknown-linux-gnu`
- `zen-backup-x86_64-pc-windows-msvc.exe`

**Step 4: Re-run release-artifact test**

Run: `deno test -A tests/unit/release-artifacts-test.ts`\
Expected: PASS.

**Step 5: Verify CI workflows reference Rust build path**

Run: `deno task lint`\
Expected: PASS.

**Step 6: Commit**

```bash
git add scripts/build-target.ts scripts/task--release-macos.ts scripts/task--release-linux.ts scripts/task--release-windows.ts .github/workflows/release-combined.yml .github/workflows/ci-linux.yml .github/workflows/ci-windows.yml README.md docs/development/OVERVIEW.md tests/unit/release-artifacts-test.ts
git commit -m "build(release): migrate cross-platform artifacts to cargo"
```

Skill focus: `@verification-before-completion`

---

### Task 12: Remove TypeScript Runtime Command Implementations After Parity

**Files:**

- Delete: `src/commands/backup.ts`
- Delete: `src/commands/list.ts`
- Delete: `src/commands/feedback.ts`
- Delete: `src/commands/uninstall.ts`
- Delete: `src/commands/install.ts`
- Delete: `src/commands/schedule.ts`
- Delete: `src/commands/restore.ts`
- Delete: `src/commands/status.ts`
- Delete: `src/archive.ts`
- Delete: `src/sqlite.ts`
- Delete: `src/config.ts`
- Delete: `src/log.ts`
- Delete: `src/platform/*.ts` (runtime modules only, keep any test-only helpers if still needed)
- Modify: `docs/development/TESTING.md`
- Modify: `docs/product/user-stories.md` (only if behavior changed)
- Modify: `docs/features/**/*.feature` (only if behavior changed)

**Step 1: Run full suite before deletion**

Run:

- `deno task lint`
- `deno task typecheck`
- `deno task test:unit`
- `deno task test:integration`
- `deno run -A scripts/task--test-acceptance.ts all`\
  Expected: PASS.

**Step 2: Delete legacy TS runtime files**

Remove only files no longer referenced by bridge/tests/tooling.

**Step 3: Re-run full suite**

Run same commands as Step 1.\
Expected: PASS.

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(runtime): remove legacy typescript command runtime"
```

Skill focus: `@verification-before-completion`

---

## Final Verification Gate

Run in order:

1. `deno task lint`
2. `deno task typecheck`
3. `deno task test:unit`
4. `deno task test:integration`
5. `deno run -A scripts/task--test-acceptance.ts all`
6. `cargo test -p zen-backup`
7. `cargo clippy -p zen-backup -- -D warnings`
8. `cargo fmt --check`

Expected: all green.

---

## Release/Cutover Notes

- Keep versioning flow unchanged (`vX.Y.Z-*` tags).
- Keep prerelease auto-detection for alpha/beta tags in release workflow.
- Keep platform maturity section in combined notes (macOS beta, Linux beta, Windows alpha unless
  changed by product decision).
- Do not change user-story platform-agnostic boundary; platform-specific changes must remain in
  `docs/features/platform/**/*.feature`.

---

Plan complete and saved to `docs/plans/2026-02-22-rust-cli-migration-plan.md`. Two execution
options:

1. **Subagent-Driven (this session)** - dispatch fresh subagent per task, review between tasks, fast
   iteration.
2. **Parallel Session (separate)** - open new session with `superpowers:executing-plans`, batch
   execution with checkpoints.

Which approach?
