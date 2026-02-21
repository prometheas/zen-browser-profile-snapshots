# Zen Profile Backup — Constitution

## Core Principles

### Article I: Data Safety First

SQLite databases must always be copied via SQLite backup API, never raw file copy. Copying a live
SQLite file risks corruption from partial writes or WAL state. Backups must never modify or risk the
source profile in any way. Cookies are explicitly excluded from backups to protect session tokens
and authentication data.

### Article II: Simplicity Over Cleverness

Use standard cross-platform APIs for archiving, file operations, and SQLite handling. No external
backup frameworks, no custom binary formats. The backup code should be readable and debuggable by
anyone who knows TypeScript.

### Article III: Fail Loudly

Errors must be logged to the backup log and surfaced via platform-native notifications. Silent
failures are unacceptable — a missed or corrupted backup that goes unnoticed is worse than a noisy
error. All operations validate preconditions and report failures clearly.

### Article IV: Restorable by Default

Every backup must be a self-contained compressed archive that can restore a fully working profile
with a single command. No multi-step restore procedures, no external dependencies at restore time,
no database re-import steps.

### Article V: Configuration Over Convention

Paths, retention periods, and cloud sync destinations are user-configurable via TOML config file.
Sensible defaults for everything so zero-config works out of the box.

### Article VI: Platform Parity

Core functionality (backup, restore, list, retention) behaves identically across macOS, Windows, and
Linux. Platform-specific features (scheduling, notifications) adapt to native OS capabilities while
maintaining consistent user experience.

## Quality Standards

- All logic must have corresponding test coverage
- Operations validate preconditions and handle errors explicitly
- No hardcoded paths — everything reads from config or platform detection
- Commits are small and frequent, one logical change per commit

## Governance

- Amendments to these principles require updating this document with rationale for the change
- Version: 1.0.0
- Ratified: 2026-02-19
