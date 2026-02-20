@core
Feature: Backup
  As a Zen browser user
  I want to create compressed backups of my profile
  So that I can recover from data loss or corruption

  Background:
    Given a profile directory containing:
      | file                              | content                           |
      | places.sqlite                     | 1 bookmark, 1 history entry       |
      | formhistory.sqlite                | 1 form entry                      |
      | permissions.sqlite                | 1 permission grant                |
      | prefs.js                          | user_pref("test", true);          |
      | extensions.json                   | {"addons":[]}                     |
    And a backup directory exists at the configured path

  # US-03: Manual Daily Backup
  Scenario: Create a daily backup manually
    When a daily backup is created
    Then an archive exists matching pattern "zen-backup-daily-\d{4}-\d{2}-\d{2}\.tar\.gz"
    And the archive is in the "daily" subdirectory
    And the exit code is 0

  # US-04: Manual Weekly Backup
  Scenario: Create a weekly backup manually
    When a weekly backup is created
    Then an archive exists matching pattern "zen-backup-weekly-\d{4}-\d{2}-\d{2}\.tar\.gz"
    And the archive is in the "weekly" subdirectory
    And the exit code is 0

  Scenario: Backup adds suffix when same-day archive already exists
    Given a daily backup archive "zen-backup-daily-2026-01-15.tar.gz" already exists
    When a daily backup is created
    Then an archive exists matching pattern "zen-backup-daily-2026-01-15-2\.tar\.gz"
    And the exit code is 0

  # US-05: Safe SQLite Backup
  Scenario: SQLite databases are backed up safely
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then "places.sqlite" in the extracted archive passes "PRAGMA integrity_check"
    And "places.sqlite" in the extracted archive contains table "moz_places"
    And "places.sqlite" in the extracted archive contains table "moz_bookmarks"
    And "formhistory.sqlite" in the extracted archive passes "PRAGMA integrity_check"
    And "permissions.sqlite" in the extracted archive passes "PRAGMA integrity_check"

  Scenario: WAL and SHM files are not included in archive
    Given the profile directory additionally contains:
      | file                    | content         |
      | places.sqlite-wal       | WAL data        |
      | places.sqlite-shm       | SHM data        |
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then the extracted archive does not contain "places.sqlite-wal"
    And the extracted archive does not contain "places.sqlite-shm"

  # US-06: SQLite Backup Fallback
  Scenario: Fallback when database is exclusively locked
    Given "places.sqlite" is exclusively locked by another process
    When a daily backup is created
    Then the exit code is 0
    And the archive contains "places.sqlite"
    And "places.sqlite" in the extracted archive passes "PRAGMA integrity_check"
    And the log contains "fallback" or "retry"

  # US-07: Complete Profile Coverage
  Scenario: All critical profile data is included
    Given a profile directory containing:
      | file                                  | content             |
      | places.sqlite                         | test data           |
      | formhistory.sqlite                    | test data           |
      | permissions.sqlite                    | test data           |
      | favicons.sqlite                       | test data           |
      | content-prefs.sqlite                  | test data           |
      | storage-sync-v2.sqlite                | test data           |
      | storage/ls-archive.sqlite             | test data           |
      | prefs.js                              | user_pref();        |
      | user.js                               | user_pref();        |
      | extensions.json                       | {}                  |
      | extensions/test@ext.xpi               | mock XPI            |
      | sessionstore-backups/recovery.jsonlz4 | session data        |
      | zen-workspaces.json                   | []                  |
      | zen-themes.json                       | []                  |
      | zen-keyboard-shortcuts.json           | {}                  |
      | storage/permanent/data.sqlite         | test data           |
      | browser-extension-data/test/data.json | {}                  |
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then the extracted archive contains "places.sqlite"
    And the extracted archive contains "formhistory.sqlite"
    And the extracted archive contains "permissions.sqlite"
    And the extracted archive contains "favicons.sqlite"
    And the extracted archive contains "prefs.js"
    And the extracted archive contains "extensions.json"
    And the extracted archive contains "extensions/test@ext.xpi"
    And the extracted archive contains "sessionstore-backups/recovery.jsonlz4"
    And the extracted archive contains "zen-workspaces.json"
    And the extracted archive contains "storage/permanent/data.sqlite"

  Scenario: Security-sensitive files are excluded
    Given a profile directory containing:
      | file           | content          |
      | places.sqlite  | test data        |
      | cookies.sqlite | session tokens   |
      | key4.db        | encryption keys  |
      | logins.json    | saved passwords  |
      | cert9.db       | certificates     |
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then the extracted archive contains "places.sqlite"
    And the extracted archive does not contain "cookies.sqlite"
    And the extracted archive does not contain "key4.db"
    And the extracted archive does not contain "logins.json"
    And the extracted archive does not contain "cert9.db"

  # US-08: Exclusion of Rebuild-able Data
  Scenario: Cache and transient data is excluded
    Given a profile directory containing:
      | file                              | content     |
      | places.sqlite                     | test data   |
      | cache2/entries/ABC123             | cache entry |
      | crashes/crash.dmp                 | crash dump  |
      | datareporting/state.json          | telemetry   |
      | storage/temporary/data            | temp data   |
      | storage/default/http+++site/data  | site cache  |
      | .parentlock                       | lock file   |
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then the extracted archive contains "places.sqlite"
    And the extracted archive does not contain "cache2/"
    And the extracted archive does not contain "crashes/"
    And the extracted archive does not contain "datareporting/"
    And the extracted archive does not contain "storage/temporary/"
    And the extracted archive does not contain "storage/default/http"
    And the extracted archive does not contain ".parentlock"

  # US-09: Extension Runtime Data Coverage
  Scenario: Extension data in moz-extension directories is included
    Given a profile directory containing:
      | file                                                    | content     |
      | places.sqlite                                           | test data   |
      | storage/default/moz-extension+++uuid123/idb/data.sqlite | ext data    |
      | storage/default/moz-extension+++uuid123/ls/data.json    | ext storage |
    When a daily backup is created
    And the archive is extracted to a temporary directory
    Then the extracted archive contains "storage/default/moz-extension+++uuid123/idb/data.sqlite"
    And the extracted archive contains "storage/default/moz-extension+++uuid123/ls/data.json"
    And "storage/default/moz-extension+++uuid123/idb/data.sqlite" in the extracted archive passes "PRAGMA integrity_check"

  # US-10: Optional Cloud Sync
  Scenario: Backup is copied to cloud path when configured
    Given cloud sync is configured to a valid path
    When a daily backup is created
    Then the archive exists in the local "daily" subdirectory
    And the archive exists in the cloud "daily" subdirectory

  # US-11: Local-Only Mode
  Scenario: No cloud copy when cloud sync is disabled
    Given cloud sync is not configured
    When a daily backup is created
    Then the archive exists in the local "daily" subdirectory
    And no cloud copy is attempted
    And the exit code is 0

  # US-21: Logging
  Scenario: Successful backup is logged
    When a daily backup is created
    Then "backup.log" contains a line matching "\[.*\] SUCCESS:.*daily"

  Scenario: Warning logged when browser is running
    Given a Zen browser process is running
    When a daily backup is created
    Then the exit code is 0
    And "backup.log" contains a line matching "\[.*\] WARNING:.*running"

  # US-28: Error - Profile Missing
  Scenario: Error when profile directory does not exist
    Given the configured profile path does not exist
    When a daily backup is attempted
    Then the exit code is non-zero
    And stderr contains the missing path
    And no archive is created

  # US-29: Error - Disk Full
  Scenario: Cleanup on disk full error
    Given the backup directory has insufficient space
    When a daily backup is attempted
    Then the exit code is non-zero
    And no partial archive files remain
    And "backup.log" contains "ERROR"

  # US-30: Error - SQLite Corruption
  Scenario: Continue with warning when SQLite file is corrupted
    Given a profile directory containing:
      | file            | content        |
      | places.sqlite   | valid data     |
      | corrupt.sqlite  | invalid data   |
    And "corrupt.sqlite" fails integrity check
    When a daily backup is created
    Then the exit code is 0
    And the archive is created
    And "backup.log" contains a line matching "\[.*\] WARNING:.*corrupt"

  # US-31: Error - Cloud Sync Failure
  Scenario: Local backup succeeds when cloud sync fails
    Given cloud sync is configured to an inaccessible path
    When a daily backup is created
    Then the archive exists in the local "daily" subdirectory
    And "backup.log" contains "ERROR"
    And the exit code is non-zero
