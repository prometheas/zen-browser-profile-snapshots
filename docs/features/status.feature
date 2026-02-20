@core
Feature: Status
  As a Zen browser user
  I want to see the backup system status
  So that I can confirm backups are working and healthy

  # US-19: Backup Status Dashboard
  Scenario: Status shows most recent daily backup
    Given the backup directory contains:
      | subdirectory | file                               | size   |
      | daily        | zen-backup-daily-2026-01-15.tar.gz | 2.5 MB |
      | daily        | zen-backup-daily-2026-01-14.tar.gz | 2.4 MB |
    When the status command is run
    Then stdout contains "daily"
    And stdout contains "zen-backup-daily-2026-01-15.tar.gz"
    And stdout contains "2.5" or a size indicator
    And stdout contains "2026-01-15" or a date indicator

  Scenario: Status shows most recent weekly backup
    Given the backup directory contains:
      | subdirectory | file                                | size   |
      | weekly       | zen-backup-weekly-2026-01-12.tar.gz | 2.6 MB |
    When the status command is run
    Then stdout contains "weekly"
    And stdout contains "zen-backup-weekly-2026-01-12.tar.gz"

  Scenario: Status shows "no backups yet" when no daily archives exist
    Given the backup directory exists but contains no daily archives
    When the status command is run
    Then stdout contains "no daily backups" or "no backups yet"

  Scenario: Status shows "no backups yet" when no weekly archives exist
    Given the backup directory exists but contains no weekly archives
    When the status command is run
    Then stdout contains "no weekly backups" or "no backups yet"

  Scenario: Status shows total disk usage
    Given the backup directory contains archives totaling 50 MB
    When the status command is run
    Then stdout contains disk usage information
    And the displayed usage is approximately 50 MB

  Scenario: Status shows disk usage breakdown
    Given the backup directory contains:
      | subdirectory | total_size |
      | daily        | 30 MB      |
      | weekly       | 20 MB      |
    When the status command is run
    Then stdout shows daily directory size
    And stdout shows weekly directory size

  # Scheduled job status (platform-specific scenarios in scheduling.feature)
  Scenario: Status indicates scheduled jobs are loaded
    Given the backup scheduled jobs are installed
    When the status command is run
    Then stdout indicates scheduled jobs are active

  Scenario: Status indicates no scheduled jobs
    Given no backup scheduled jobs are installed
    When the status command is run
    Then stdout contains "No scheduled jobs" or "not installed"

  # Not installed state
  Scenario: Status shows "Not installed" when settings.toml is missing
    Given no settings.toml file exists
    When the status command is run
    Then stdout contains "Not installed"
    And stdout suggests running "zen-backup install"
    And the exit code is 0

  Scenario: Status shows configuration summary
    Given the backup tool is installed
    And settings.toml contains:
      | key               | value                     |
      | profile.path      | ~/zen-profile             |
      | backup.local_path | ~/zen-backups             |
      | backup.cloud_path | ~/Google Drive/Backups    |
    When the status command is run
    Then stdout shows the profile path
    And stdout shows the backup directory
    And stdout shows cloud sync is enabled

  Scenario: Status shows local-only mode
    Given the backup tool is installed
    And cloud sync is not configured
    When the status command is run
    Then stdout indicates "local only" or no cloud path

  # Health indicators
  Scenario: Status indicates healthy when recent backup exists
    Given the most recent daily backup is less than 2 days old
    When the status command is run
    Then stdout indicates healthy status or no warnings

  Scenario: Status warns when no recent backups
    Given the most recent daily backup is more than 3 days old
    When the status command is run
    Then stdout contains a warning about stale backups

  Scenario: Status warns when no backups at all
    Given the backup directory contains no archives
    And the backup tool was installed more than 1 day ago
    When the status command is run
    Then stdout contains a warning suggesting to run a backup

  # Retention status
  Scenario: Status shows retention settings
    Given settings.toml contains:
      | key                   | value |
      | retention.daily_days  | 30    |
      | retention.weekly_days | 84    |
    When the status command is run
    Then stdout shows daily retention period
    And stdout shows weekly retention period

  # Error conditions
  Scenario: Status handles missing backup directory gracefully
    Given the configured backup directory does not exist
    When the status command is run
    Then stdout indicates backup directory not found
    And suggests running a backup or checking configuration
    And the exit code is 0

  Scenario: Status handles permission error gracefully
    Given the backup directory is not readable
    When the status command is run
    Then stdout indicates a permission error
    And the exit code is non-zero
