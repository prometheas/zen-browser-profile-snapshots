# Rust Runtime Parity Matrix

This matrix tracks command parity between legacy TypeScript runtime behavior and the Rust runtime
used via `runCli()`.

Status values:

- `green`: parity confirmed by existing integration + acceptance coverage
- `yellow`: parity covered in integration, but acceptance edge coverage still pending
- `red`: parity gap identified and not yet closed

## CLI Commands

| Command                   | Exit code parity | Output parity | Side-effect parity | Status | Evidence                                        |
| ------------------------- | ---------------- | ------------- | ------------------ | ------ | ----------------------------------------------- |
| `status`                  | yes              | yes           | n/a                | green  | `tests/integration/status-cli-test.ts`          |
| `list`                    | yes              | yes           | n/a                | green  | `tests/integration/list-cli-test.ts`            |
| `backup daily`            | yes              | yes           | yes                | green  | `tests/integration/backup-cli-test.ts`          |
| `backup weekly`           | yes              | yes           | yes                | green  | `tests/integration/backup-cli-test.ts`          |
| `restore <archive>`       | yes              | yes           | yes                | green  | `tests/integration/restore-cli-test.ts`         |
| `install`                 | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`        |
| `uninstall`               | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`        |
| `schedule start`/`resume` | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`        |
| `schedule stop`/`pause`   | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`        |
| `schedule status`         | yes              | yes           | n/a                | green  | `tests/integration/platform-cli-test.ts`        |
| `feedback bug`            | yes              | yes           | yes                | green  | `tests/integration/feedback-cli-test.ts`        |
| `feedback request`        | yes              | yes           | yes                | green  | `tests/integration/feedback-cli-test.ts`        |
| `--help`/`-h`             | yes              | yes           | n/a                | green  | `tests/unit/cli-help-test.ts`                   |
| `--version`/`-v`          | yes              | yes           | n/a                | green  | `tests/unit/cli-help-test.ts`                   |
| unknown command           | yes              | yes           | n/a                | green  | `rust/zen-backup/tests/unknown-command-test.rs` |

## Runtime/Bridge Behavior

| Area                                                       | Status | Evidence                                    |
| ---------------------------------------------------------- | ------ | ------------------------------------------- |
| Rust bridge default path                                   | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Runtime option env mapping (`os`, `now`, `version`, `cwd`) | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Explicit Rust binary override (`ZEN_BACKUP_RUST_CLI_BIN`)  | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Legacy TS fallback gate removed from `runCli()`            | green  | `tests/integration/rust-cli-bridge-test.ts` |

## Acceptance Coverage Status

- Cucumber-rs acceptance executes via `deno task test:acceptance:rust`.
- `deno task test:acceptance` and platform aliases now route to the rust acceptance harness.
- CI/release workflows execute the rust acceptance suite on Linux and Windows.

## Known Gaps Before TS Runtime Removal

1. Continue pruning stale Cucumber-JS references from historical planning documents.
