@platform
Feature: Notifications
  As a Zen browser user
  I want to receive platform-native notifications about backup events
  So that I'm aware of warnings and errors

  # US-20: Notification When Backing Up With Browser Open
  @macos
  Scenario: Warning notification via osascript when browser is running
    Given a Zen browser process is running
    When a daily backup is created
    Then a macOS notification is displayed with title "Zen Backup"
    And the notification contains "browser is running"
    And the backup completes successfully

  @linux
  Scenario: Warning notification via notify-send when browser is running
    Given a Zen browser process is running
    When a daily backup is created
    Then a desktop notification is displayed with title "Zen Backup"
    And the notification contains "browser is running"
    And the backup completes successfully

  @windows
  Scenario: Warning notification via PowerShell toast when browser is running
    Given a Zen browser process is running
    When a daily backup is created
    Then a Windows toast notification is displayed with title "Zen Backup"
    And the notification contains "browser is running"
    And the backup completes successfully

  # Error notifications
  @macos
  Scenario: Error notification via osascript when profile is missing
    Given the configured profile path does not exist
    When a daily backup is attempted
    Then a macOS notification is displayed with title "Zen Backup Error"
    And the notification contains "profile" and "not found"

  @linux
  Scenario: Error notification via notify-send when profile is missing
    Given the configured profile path does not exist
    When a daily backup is attempted
    Then a desktop notification is displayed with title "Zen Backup Error"
    And the notification contains "profile" and "not found"

  @windows
  Scenario: Error notification via PowerShell toast when profile is missing
    Given the configured profile path does not exist
    When a daily backup is attempted
    Then a Windows toast notification is displayed with title "Zen Backup Error"
    And the notification contains "profile" and "not found"

  # Cloud sync error notifications
  @macos
  Scenario: Error notification when cloud sync fails on macOS
    Given cloud sync is configured to an inaccessible path
    When a daily backup is created
    Then a macOS notification is displayed with title "Zen Backup Warning"
    And the notification contains "cloud" and "failed"
    And the local backup archive exists

  @linux
  Scenario: Error notification when cloud sync fails on Linux
    Given cloud sync is configured to an inaccessible path
    When a daily backup is created
    Then a desktop notification is displayed with title "Zen Backup Warning"
    And the notification contains "cloud" and "failed"
    And the local backup archive exists

  @windows
  Scenario: Error notification when cloud sync fails on Windows
    Given cloud sync is configured to an inaccessible path
    When a daily backup is created
    Then a Windows toast notification is displayed with title "Zen Backup Warning"
    And the notification contains "cloud" and "failed"
    And the local backup archive exists

  # Notification content
  Scenario Outline: Browser running notification explains SQLite safety
    Given a Zen browser process is running
    When a daily backup is created on <platform>
    Then the notification explains that SQLite databases are safely backed up
    And the notification explains that session files may be mid-write

    Examples:
      | platform |
      | macos    |
      | linux    |
      | windows  |

  # Notifications can be disabled
  Scenario: No notification when notifications are disabled
    Given notifications are disabled in configuration (notifications.enabled = false)
    And a Zen browser process is running
    When a daily backup is created
    Then no notification is displayed
    And the backup completes successfully
    And the warning is still logged to backup.log

  # Notification graceful degradation
  @linux
  Scenario: Backup continues when notify-send is not available
    Given notify-send is not installed
    When a daily backup is created
    Then the backup completes successfully
    And a warning is logged about notifications unavailable

  @windows
  Scenario: Backup continues when toast notifications fail
    Given PowerShell toast notification fails
    When a daily backup is created
    Then the backup completes successfully
    And a warning is logged about notifications unavailable
