@core
Feature: Configuration
  As a Zen browser user
  I want to configure paths and settings via a TOML file
  So that I can customise the tool without editing source code

  # US-22: TOML-Based Configuration
  Scenario: Configuration is read from default location
    Given a config file exists at the platform default location:
      | platform | path                                          |
      | macos    | ~/.config/zen-profile-backup/settings.toml    |
      | linux    | ~/.config/zen-profile-backup/settings.toml    |
      | windows  | %APPDATA%\zen-profile-backup\settings.toml    |
    And the config file contains:
      """
      [profile]
      path = "~/Library/Application Support/zen/Profiles/default"

      [backup]
      local_path = "~/zen-backups"

      [retention]
      daily_days = 30
      weekly_days = 84

      [schedule]
      daily_time = "12:30"
      weekly_day = "Sunday"
      weekly_time = "02:00"

      [notifications]
      enabled = true
      """
    When a backup command is run
    Then the backup uses the configured profile path
    And archives are created in "~/zen-backups"

  Scenario: Profile section is parsed correctly
    Given a config file containing:
      """
      [profile]
      path = "~/my-zen-profile"
      """
    When the configuration is loaded
    Then profile.path equals the expanded value of "~/my-zen-profile"

  Scenario: Backup section is parsed correctly
    Given a config file containing:
      """
      [backup]
      local_path = "~/backups"
      cloud_path = "~/Google Drive/Backups"
      """
    When the configuration is loaded
    Then backup.local_path equals the expanded value of "~/backups"
    And backup.cloud_path equals the expanded value of "~/Google Drive/Backups"

  Scenario: Retention section is parsed correctly
    Given a config file containing:
      """
      [retention]
      daily_days = 14
      weekly_days = 56
      """
    When the configuration is loaded
    Then retention.daily_days equals 14
    And retention.weekly_days equals 56

  Scenario: Schedule section is parsed correctly
    Given a config file containing:
      """
      [schedule]
      daily_time = "09:15"
      weekly_day = "Saturday"
      weekly_time = "01:30"
      """
    When the configuration is loaded
    Then schedule.daily_time equals "09:15"
    And schedule.weekly_day equals "Saturday"
    And schedule.weekly_time equals "01:30"

  Scenario: Notifications section is parsed correctly
    Given a config file containing:
      """
      [notifications]
      enabled = false
      """
    When the configuration is loaded
    Then notifications.enabled equals false

  Scenario: Tilde is expanded to home directory
    Given a config file containing:
      """
      [backup]
      local_path = "~/zen-backups"
      """
    When the configuration is loaded
    Then backup.local_path starts with the user's home directory
    And backup.local_path ends with "zen-backups"

  Scenario: Environment variables in paths are expanded
    Given the environment variable "ZEN_BACKUP_DIR" is set to "/custom/path"
    And a config file containing:
      """
      [backup]
      local_path = "$ZEN_BACKUP_DIR/backups"
      """
    When the configuration is loaded
    Then backup.local_path equals "/custom/path/backups"

  Scenario: Quoted values are handled correctly
    Given a config file containing:
      """
      [profile]
      path = "~/Path With Spaces/profile"
      """
    When the configuration is loaded
    Then profile.path contains "Path With Spaces"

  Scenario: Unquoted values are handled correctly
    Given a config file containing:
      """
      [retention]
      daily_days = 30
      """
    When the configuration is loaded
    Then retention.daily_days equals 30

  # US-23: Overridable Config Path
  Scenario: Config path can be overridden via environment variable
    Given the environment variable "ZEN_BACKUP_CONFIG" is set to "/custom/config.toml"
    And a config file exists at "/custom/config.toml" containing:
      """
      [profile]
      path = "~/custom-profile"
      """
    When the configuration is loaded
    Then profile.path equals the expanded value of "~/custom-profile"

  Scenario: Default path is used when environment variable is unset
    Given the environment variable "ZEN_BACKUP_CONFIG" is not set
    And a config file exists at the platform default location
    When the configuration is loaded
    Then the default config file is used

  Scenario: Error when config file does not exist
    Given no config file exists at the default location
    And the environment variable "ZEN_BACKUP_CONFIG" is not set
    When a backup command is run
    Then the exit code is non-zero
    And stderr contains "config" and "not found"

  Scenario: Error when config file is malformed
    Given a config file containing:
      """
      [profile
      path = invalid
      """
    When the configuration is loaded
    Then the exit code is non-zero
    And stderr contains "parse" or "invalid"

  # Edge cases
  Scenario: Empty cloud_path means local-only mode
    Given a config file containing:
      """
      [backup]
      local_path = "~/zen-backups"
      cloud_path = ""
      """
    When the configuration is loaded
    Then cloud sync is disabled

  Scenario: Missing cloud_path means local-only mode
    Given a config file containing:
      """
      [backup]
      local_path = "~/zen-backups"
      """
    When the configuration is loaded
    Then cloud sync is disabled

  Scenario: Comments in config file are ignored
    Given a config file containing:
      """
      # This is a comment
      [profile]
      path = "~/profile"  # inline comment
      """
    When the configuration is loaded
    Then profile.path equals the expanded value of "~/profile"
