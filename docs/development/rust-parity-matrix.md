# Rust Runtime Parity Matrix

This matrix tracks command parity between legacy TypeScript runtime behavior and the Rust runtime
used via `runCli()`.

Status values:

- `green`: parity confirmed by existing integration + acceptance coverage
- `yellow`: parity covered in integration, but acceptance edge coverage still pending
- `red`: parity gap identified and not yet closed

## CLI Commands

| Command             | Exit code parity | Output parity | Side-effect parity | Status | Evidence                                                     |
| ------------------- | ---------------- | ------------- | ------------------ | ------ | ------------------------------------------------------------ |
| `status`            | yes              | yes           | n/a                | green  | `tests/integration/status-cli-test.ts`                       |
| `list`              | yes              | yes           | n/a                | green  | `tests/integration/list-cli-test.ts`                         |
| `backup daily`      | yes              | yes           | yes                | green  | `tests/integration/backup-cli-test.ts`                       |
| `backup weekly`     | yes              | yes           | yes                | green  | `tests/integration/backup-cli-test.ts`                       |
| `restore <archive>` | yes              | yes           | yes                | green  | `tests/integration/restore-cli-test.ts`                      |
| `install`           | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`                     |
| `uninstall`         | yes              | yes           | yes                | green  | `tests/integration/platform-cli-test.ts`                     |
| `schedule start     | resume`          | yes           | yes                | yes    | green                                                        |
| `schedule stop      | pause`           | yes           | yes                | yes    | green                                                        |
| `schedule status`   | yes              | yes           | n/a                | green  | `tests/integration/platform-cli-test.ts`                     |
| `feedback bug`      | yes              | yes           | yes                | green  | `tests/integration/feedback-cli-test.ts`                     |
| `feedback request`  | yes              | yes           | yes                | green  | `tests/integration/feedback-cli-test.ts`                     |
| `--help`/`-h`       | yes              | yes           | n/a                | green  | `tests/unit/cli-help-test.ts`                                |
| `--version`/`-v`    | yes              | yes           | n/a                | green  | `tests/unit/cli-help-test.ts`                                |
| unknown command     | yes              | yes           | n/a                | yellow | integration lock pending while TS fallback remains available |

## Runtime/Bridge Behavior

| Area                                                       | Status | Evidence                                    |
| ---------------------------------------------------------- | ------ | ------------------------------------------- |
| Rust bridge default path                                   | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Runtime option env mapping (`os`, `now`, `version`, `cwd`) | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Explicit Rust binary override (`ZEN_BACKUP_RUST_CLI_BIN`)  | green  | `tests/integration/rust-cli-bridge-test.ts` |
| Temporary TS fallback gate (`ZEN_BACKUP_USE_TS_CLI`)       | green  | `tests/integration/rust-cli-bridge-test.ts` |

## Acceptance Coverage Status

- Current canonical acceptance execution remains Cucumber-JS via `deno task test:acceptance`.
- Rust runtime is exercised indirectly by acceptance through `runCli()` bridge.
- Cucumber-rs dual-run is **not yet** enabled in CI.

## Known Gaps Before TS Runtime Removal

1. Cucumber-rs harness needs to be added and dual-run against canonical feature files.
2. Unknown-command behavior should be fully locked in acceptance/integration before removing any TS
   runtime fallback controls.
3. CI should execute both acceptance engines during burn-in to prove parity.
