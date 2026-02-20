@core
Feature: List Snapshots
  As a Zen browser user
  I want to see all available backup snapshots
  So that I can identify and pick the right snapshot to restore from

  # US-18: List Available Snapshots
  Scenario: List shows daily and weekly archives
    Given the backup directory contains:
      | subdirectory | file                               | size   |
      | daily        | zen-backup-daily-2026-01-15.tar.gz | 2.5 MB |
      | daily        | zen-backup-daily-2026-01-14.tar.gz | 2.4 MB |
      | weekly       | zen-backup-weekly-2026-01-12.tar.gz| 2.6 MB |
    When the list command is run
    Then stdout contains "daily"
    And stdout contains "zen-backup-daily-2026-01-15.tar.gz"
    And stdout contains "zen-backup-daily-2026-01-14.tar.gz"
    And stdout contains "weekly"
    And stdout contains "zen-backup-weekly-2026-01-12.tar.gz"
    And the exit code is 0

  Scenario: List shows file sizes
    Given the backup directory contains:
      | subdirectory | file                               | size   |
      | daily        | zen-backup-daily-2026-01-15.tar.gz | 2.5 MB |
    When the list command is run
    Then stdout contains "2.5" or a size indicator

  Scenario: Archives are listed in chronological order
    Given the backup directory contains:
      | subdirectory | file                               |
      | daily        | zen-backup-daily-2026-01-13.tar.gz |
      | daily        | zen-backup-daily-2026-01-15.tar.gz |
      | daily        | zen-backup-daily-2026-01-14.tar.gz |
    When the list command is run
    Then "2026-01-13" appears before "2026-01-14" in stdout
    And "2026-01-14" appears before "2026-01-15" in stdout

  Scenario: List handles empty backup directory
    Given the backup directory exists but contains no archives
    When the list command is run
    Then stdout contains "no backups" or "empty"
    And the exit code is 0

  Scenario: List handles missing backup directory
    Given the backup directory does not exist
    When the list command is run
    Then the exit code is non-zero
    And stderr contains "not found" or "does not exist"

  Scenario: List shows only valid archive files
    Given the backup directory contains:
      | subdirectory | file                               |
      | daily        | zen-backup-daily-2026-01-15.tar.gz |
      | daily        | .DS_Store                          |
      | daily        | readme.txt                         |
    When the list command is run
    Then stdout contains "zen-backup-daily-2026-01-15.tar.gz"
    And stdout does not contain ".DS_Store"
    And stdout does not contain "readme.txt"

  Scenario: List distinguishes daily and weekly types
    Given the backup directory contains:
      | subdirectory | file                                |
      | daily        | zen-backup-daily-2026-01-15.tar.gz  |
      | weekly       | zen-backup-weekly-2026-01-12.tar.gz |
    When the list command is run
    Then the daily archive is labeled as "daily" or in a daily section
    And the weekly archive is labeled as "weekly" or in a weekly section
