@platform
Feature: Install
  As a Zen browser user
  I want an interactive installer to guide me through setup
  So that configuration and scheduling are ready without manual file editing

  # US-24: Auto-Detecting Interactive Installer
  @macos
  Scenario: Profile auto-detected on macOS
    Given a Zen profile exists at "~/Library/Application Support/zen/Profiles/default"
    When the install command is run
    Then the installer detects and displays the profile path
    And the user is not required to enter the path manually

  @linux
  Scenario: Profile auto-detected on Linux (.zen)
    Given a Zen profile exists at "~/.zen/default"
    When the install command is run
    Then the installer detects and displays the profile path

  @linux
  Scenario: Profile auto-detected on Linux (.config/zen)
    Given a Zen profile exists at "~/.config/zen/default"
    When the install command is run
    Then the installer detects and displays the profile path

  @windows
  Scenario: Profile auto-detected on Windows
    Given a Zen profile exists at "%APPDATA%\zen\Profiles\default"
    When the install command is run
    Then the installer detects and displays the profile path

  Scenario: User prompted when no profile found
    Given no Zen profile is detected
    When the install command is run
    Then the installer prompts for the profile path
    And the user can enter a custom path

  Scenario: User prompted for backup directory
    Given a Zen profile is detected
    When the install command is run
    Then the installer prompts for backup directory
    And the default is suggested based on platform

  @macos @linux
  Scenario: Default backup directory on Unix-like systems
    When the install command is run
    Then the default backup directory is "~/zen-backups"

  @windows
  Scenario: Default backup directory on Windows
    When the install command is run
    Then the default backup directory is "%USERPROFILE%\zen-backups"

  # US-25: Cloud Sync Provider Selection
  @macos
  Scenario: Google Drive detected on macOS
    Given Google Drive is mounted at "~/Library/CloudStorage/GoogleDrive-user@gmail.com/My Drive"
    When the install command is run
    Then "Google Drive" appears as a cloud sync option

  @macos
  Scenario: iCloud Drive detected on macOS
    Given iCloud Drive is available at "~/Library/Mobile Documents/com~apple~CloudDocs"
    When the install command is run
    Then "iCloud Drive" appears as a cloud sync option

  @linux
  Scenario: Google Drive detected on Linux
    Given a Google Drive folder exists at "~/google-drive"
    When the install command is run
    Then "Google Drive" appears as a cloud sync option

  @windows
  Scenario: Google Drive detected on Windows
    Given Google Drive is mounted at "G:\My Drive"
    When the install command is run
    Then "Google Drive" appears as a cloud sync option

  @windows
  Scenario: OneDrive detected on Windows
    Given OneDrive is available at "%USERPROFILE%\OneDrive"
    When the install command is run
    Then "OneDrive" appears as a cloud sync option

  @macos
  Scenario: OneDrive detected on macOS
    Given OneDrive is mounted at "~/Library/CloudStorage/OneDrive-Personal"
    When the install command is run
    Then "OneDrive" appears as a cloud sync option

  Scenario: Dropbox detected
    Given Dropbox is available at the platform-standard location
    When the install command is run
    Then "Dropbox" appears as a cloud sync option

  Scenario: Custom path option always available
    When the install command is run
    Then "Custom path" appears as a cloud sync option

  Scenario: Local-only option always available
    When the install command is run
    Then "None (local only)" appears as a cloud sync option

  Scenario: User can skip cloud sync
    Given the install command is running
    When the user selects "None (local only)"
    Then no cloud_path is written to settings.toml
    And the installer continues to scheduling

  # Configuration file creation
  Scenario: Valid settings.toml is created
    Given the user completes the install wizard
    When the installer finishes
    Then a settings.toml file exists at the platform config location
    And the file contains [profile] section
    And the file contains [backup] section
    And the file contains [retention] section

  # US-26: Automated Scheduling on Install
  @macos
  Scenario: Launchd agents installed on macOS
    Given the user completes the install wizard
    When the installer finishes
    Then "com.zen-backup.daily.plist" exists in "~/Library/LaunchAgents/"
    And "com.zen-backup.weekly.plist" exists in "~/Library/LaunchAgents/"
    And the agents are loaded and enabled

  @macos
  Scenario: Launchd plists have paths substituted
    Given the user completes the install wizard
    When the installer finishes
    Then the plist files contain actual paths, not placeholders
    And "$HOME" is replaced with the user's home directory

  @linux
  Scenario: Systemd user timers installed on Linux
    Given the user completes the install wizard
    When the installer finishes
    Then "zen-backup-daily.timer" exists in "~/.config/systemd/user/"
    And "zen-backup-weekly.timer" exists in "~/.config/systemd/user/"
    And the timers are enabled

  @windows
  Scenario: Task Scheduler tasks created on Windows
    Given the user completes the install wizard
    When the installer finishes
    Then scheduled task "ZenBackupDaily" exists
    And scheduled task "ZenBackupWeekly" exists
    And the tasks run in the current user context

  # US-27: Non-Destructive Uninstall
  @macos
  Scenario: Uninstall removes launchd agents
    Given the backup tool is installed
    When the uninstall command is run
    Then "com.zen-backup.daily.plist" is removed from "~/Library/LaunchAgents/"
    And "com.zen-backup.weekly.plist" is removed from "~/Library/LaunchAgents/"
    And the agents are unloaded

  @linux
  Scenario: Uninstall removes systemd timers
    Given the backup tool is installed
    When the uninstall command is run
    Then "zen-backup-daily.timer" is disabled and removed
    And "zen-backup-weekly.timer" is disabled and removed

  @windows
  Scenario: Uninstall removes Task Scheduler tasks
    Given the backup tool is installed
    When the uninstall command is run
    Then scheduled task "ZenBackupDaily" is removed
    And scheduled task "ZenBackupWeekly" is removed

  Scenario: Uninstall preserves backup archives
    Given the backup tool is installed
    And backup archives exist in the backup directory
    When the uninstall command is run
    Then all backup archives still exist

  Scenario: Uninstall preserves settings.toml
    Given the backup tool is installed
    And settings.toml exists
    When the uninstall command is run
    Then settings.toml still exists

  # Error handling
  Scenario: Install fails gracefully on permission error
    Given the user does not have write permission to the config directory
    When the install command is run
    Then the installer displays a permission error
    And suggests running with appropriate permissions
    And the exit code is non-zero

  Scenario: Install validates profile path exists
    Given the user enters a non-existent profile path
    When the installer validates the path
    Then an error is displayed
    And the user is prompted to enter a valid path
