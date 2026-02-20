@core
Feature: Retention
  As a Zen browser user
  I want old backup archives automatically deleted
  So that backups don't accumulate and fill up my disk

  # Retention uses the date encoded in the archive filename, not file mtime.

  # US-12: Automatic Daily Retention Enforcement
  Scenario: Daily archives older than retention period are deleted
    Given the configuration has "retention.daily_days = 7"
    And the backup directory contains daily archives:
      | file                               | age_days |
      | zen-backup-daily-2026-01-15.tar.gz | 1        |
      | zen-backup-daily-2026-01-10.tar.gz | 6        |
      | zen-backup-daily-2026-01-05.tar.gz | 11       |
      | zen-backup-daily-2026-01-01.tar.gz | 15       |
    When a daily backup is created
    Then "zen-backup-daily-2026-01-15.tar.gz" exists in the daily directory
    And "zen-backup-daily-2026-01-10.tar.gz" exists in the daily directory
    And "zen-backup-daily-2026-01-05.tar.gz" does not exist
    And "zen-backup-daily-2026-01-01.tar.gz" does not exist

  Scenario: Daily archives within retention period are preserved
    Given the configuration has "retention.daily_days = 30"
    And the backup directory contains daily archives:
      | file                               | age_days |
      | zen-backup-daily-2026-01-15.tar.gz | 1        |
      | zen-backup-daily-2026-01-01.tar.gz | 15       |
    When a daily backup is created
    Then "zen-backup-daily-2026-01-15.tar.gz" exists in the daily directory
    And "zen-backup-daily-2026-01-01.tar.gz" exists in the daily directory

  # US-13: Automatic Weekly Retention Enforcement
  Scenario: Weekly archives older than retention period are deleted
    Given the configuration has "retention.weekly_days = 84"
    And the backup directory contains weekly archives:
      | file                                | age_days |
      | zen-backup-weekly-2026-01-12.tar.gz | 7        |
      | zen-backup-weekly-2025-11-01.tar.gz | 80       |
      | zen-backup-weekly-2025-10-01.tar.gz | 110      |
    When a weekly backup is created
    Then "zen-backup-weekly-2026-01-12.tar.gz" exists in the weekly directory
    And "zen-backup-weekly-2025-11-01.tar.gz" exists in the weekly directory
    And "zen-backup-weekly-2025-10-01.tar.gz" does not exist

  # US-14: Configurable Retention Periods
  Scenario: Custom retention periods are respected
    Given the configuration has:
      | key                   | value |
      | retention.daily_days  | 14    |
      | retention.weekly_days | 56    |
    And the backup directory contains daily archives:
      | file                               | age_days |
      | zen-backup-daily-2026-01-10.tar.gz | 6        |
      | zen-backup-daily-2025-12-20.tar.gz | 27       |
    When a daily backup is created
    Then "zen-backup-daily-2026-01-10.tar.gz" exists in the daily directory
    And "zen-backup-daily-2025-12-20.tar.gz" does not exist

  Scenario: Default retention periods are used when not configured
    Given the configuration does not specify retention periods
    And the backup directory contains daily archives:
      | file                               | age_days |
      | zen-backup-daily-2025-12-01.tar.gz | 35       |
    When a daily backup is created
    Then "zen-backup-daily-2025-12-01.tar.gz" does not exist
    # Default is 30 days

  Scenario: Missing config values fall back to defaults silently
    Given the configuration has only "retention.daily_days = 14"
    And "retention.weekly_days" is not configured
    When a weekly backup is created
    Then the exit code is 0
    And no warning about missing config is logged

  # Cloud retention
  Scenario: Cloud daily directory is also pruned
    Given cloud sync is configured
    And the cloud daily directory contains:
      | file                               | age_days |
      | zen-backup-daily-2025-12-01.tar.gz | 35       |
    When a daily backup is created
    Then "zen-backup-daily-2025-12-01.tar.gz" does not exist in the cloud daily directory

  Scenario: Cloud weekly directory is also pruned
    Given cloud sync is configured
    And the configuration has "retention.weekly_days = 84"
    And the cloud weekly directory contains:
      | file                                | age_days |
      | zen-backup-weekly-2025-09-01.tar.gz | 140      |
    When a weekly backup is created
    Then "zen-backup-weekly-2025-09-01.tar.gz" does not exist in the cloud weekly directory

  # Edge cases
  Scenario: Retention does not delete other file types
    Given the configuration has "retention.daily_days = 7"
    And the backup directory contains:
      | subdirectory | file       | age_days |
      | daily        | backup.log | 100      |
    When a daily backup is created
    Then "backup.log" exists in the daily directory

  Scenario: Retention handles empty directory gracefully
    Given the configuration has "retention.daily_days = 7"
    And the daily backup directory is empty
    When a daily backup is created
    Then the exit code is 0
    And no errors are logged
