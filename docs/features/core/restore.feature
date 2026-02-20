@core
Feature: Restore
  As a Zen browser user
  I want to restore my profile from a backup snapshot
  So that I can recover from data loss or corruption

  Background:
    Given a valid backup archive "zen-backup-daily-2026-01-15.tar.gz" exists
    And the archive contains:
      | file            | content                     |
      | places.sqlite   | 1 bookmark, 1 history entry |
      | prefs.js        | user_pref("test", true);    |
      | extensions.json | {"addons":[]}               |
    And the current profile directory exists with different content

  # US-15: One-Command Restore
  Scenario: Restore from a daily backup
    Given the Zen browser is not running
    When restore is run with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then the profile directory contains "places.sqlite"
    And "places.sqlite" in the profile passes "PRAGMA integrity_check"
    And the profile directory contains "prefs.js"
    And the profile directory contains "extensions.json"
    And the exit code is 0
    And stdout contains the archive path

  Scenario: Restore from a weekly backup
    Given a valid backup archive "zen-backup-weekly-2026-01-12.tar.gz" exists
    And the Zen browser is not running
    When restore is run with archive "zen-backup-weekly-2026-01-12.tar.gz"
    Then the profile directory contains "places.sqlite"
    And the exit code is 0

  Scenario: Restore preserves SQLite database integrity
    Given the archive contains SQLite databases with multiple tables
    And the Zen browser is not running
    When restore is run with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then every ".sqlite" file in the profile passes "PRAGMA integrity_check"

  # US-16: Safety Pre-Restore Backup
  Scenario: Current profile is backed up before restore
    Given the current profile contains:
      | file          | content      |
      | places.sqlite | current data |
      | prefs.js      | current pref |
    And the Zen browser is not running
    When restore is run with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then a directory exists matching pattern "<profile>.pre-restore-\d{4}-\d{2}-\d{2}"
    And the pre-restore directory contains "places.sqlite"
    And the pre-restore directory contains "prefs.js"
    And stdout contains "pre-restore"

  Scenario: Pre-restore backup is preserved after restore completes
    Given the Zen browser is not running
    When restore is run with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then the pre-restore directory still exists
    And the pre-restore directory is not empty

  # US-17: Restore Blocked When Browser Is Running
  Scenario: Restore is blocked when Zen browser is running
    Given a Zen browser process is running
    When restore is attempted with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then the exit code is non-zero
    And stderr contains "must be closed"
    And the profile directory is unchanged

  Scenario: Profile is not modified when restore is blocked
    Given a Zen browser process is running
    And the current profile contains:
      | file          | content       |
      | places.sqlite | original data |
    When restore is attempted with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then "places.sqlite" in the profile contains "original data"
    And no pre-restore directory is created

  # US-21: Logging
  Scenario: Successful restore is logged
    Given the Zen browser is not running
    When restore is run with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then "backup.log" contains a line matching "\[.*\] RESTORE:.*2026-01-15"

  # US-32: Error - Corrupted Archive
  Scenario: Original profile is preserved when archive is corrupted
    Given a corrupted archive "zen-backup-daily-2026-01-15.tar.gz" exists
    And the current profile contains:
      | file          | content       |
      | places.sqlite | original data |
    And the Zen browser is not running
    When restore is attempted with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then the exit code is non-zero
    And stderr contains "corrupted" or "invalid"
    And "places.sqlite" in the profile contains "original data"

  Scenario: Error identifies the corrupted archive
    Given a corrupted archive "zen-backup-daily-2026-01-15.tar.gz" exists
    And the Zen browser is not running
    When restore is attempted with archive "zen-backup-daily-2026-01-15.tar.gz"
    Then stderr contains "zen-backup-daily-2026-01-15"

  # Edge cases
  Scenario: Restore handles archive with absolute paths
    Given an archive created with absolute paths
    And the Zen browser is not running
    When restore is run with the archive
    Then files are extracted to the profile directory, not absolute paths
    And the exit code is 0

  Scenario: Restore with archive path containing spaces
    Given a valid backup archive "zen backup daily 2026-01-15.tar.gz" exists
    And the Zen browser is not running
    When restore is run with archive "zen backup daily 2026-01-15.tar.gz"
    Then the exit code is 0
    And the profile directory contains "places.sqlite"
