@platform
Feature: Scheduling
  As a Zen browser user
  I want automatic backups to run on a schedule
  So that I don't have to remember to back up my profile manually

  # US-01: Automatic Daily Backups
  @macos
  Scenario: Daily backup scheduled via launchd
    Given the backup tool is installed
    When the scheduler is queried
    Then a launchd agent "com.prometheas.zen-backup.daily" is loaded
    And the agent is configured to run at the configured daily_time (default: 12:30)

  @macos
  Scenario: Daily launchd agent fires backup command
    Given the launchd agent "com.prometheas.zen-backup.daily" is loaded
    When the scheduled time 12:30 is reached
    Then a daily backup archive is created
    And output is written to the log file

  @linux
  Scenario: Daily backup scheduled via systemd timer
    Given the backup tool is installed
    When the scheduler is queried
    Then a systemd user timer "zen-backup-daily.timer" is active
    And the timer is configured to run at the configured daily_time (default: 12:30)

  @linux
  Scenario: Daily systemd timer fires backup command
    Given the systemd timer "zen-backup-daily.timer" is active
    When the scheduled time 12:30 is reached
    Then a daily backup archive is created
    And output is written to the journal

  @windows
  Scenario: Daily backup scheduled via Task Scheduler
    Given the backup tool is installed
    When the scheduler is queried
    Then a scheduled task "ZenBackupDaily" exists
    And the task is configured to run at the configured daily_time (default: 12:30)

  @windows
  Scenario: Daily Task Scheduler task fires backup command
    Given the scheduled task "ZenBackupDaily" exists
    When the scheduled time 12:30 is reached
    Then a daily backup archive is created
    And output is written to the log file

  # US-02: Automatic Weekly Backups
  @macos
  Scenario: Weekly backup scheduled via launchd
    Given the backup tool is installed
    When the scheduler is queried
    Then a launchd agent "com.prometheas.zen-backup.weekly" is loaded
    And the agent is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)

  @linux
  Scenario: Weekly backup scheduled via systemd timer
    Given the backup tool is installed
    When the scheduler is queried
    Then a systemd user timer "zen-backup-weekly.timer" is active
    And the timer is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)

  @windows
  Scenario: Weekly backup scheduled via Task Scheduler
    Given the backup tool is installed
    When the scheduler is queried
    Then a scheduled task "ZenBackupWeekly" exists
    And the task is configured to run at the configured weekly_day and weekly_time (default: Sunday 02:00)

  # Scheduler queries for status
  @macos
  Scenario: Status shows loaded launchd agents
    Given the launchd agents are loaded
    When the status command is run
    Then stdout lists "com.prometheas.zen-backup.daily"
    And stdout lists "com.prometheas.zen-backup.weekly"

  @macos
  Scenario: Status shows when no launchd agents are loaded
    Given no launchd agents are loaded
    When the status command is run
    Then stdout contains "No scheduled jobs" or "not loaded"

  @linux
  Scenario: Status shows active systemd timers
    Given the systemd timers are active
    When the status command is run
    Then stdout lists "zen-backup-daily.timer"
    And stdout lists "zen-backup-weekly.timer"

  @linux
  Scenario: Status shows when no systemd timers are active
    Given no systemd timers are active
    When the status command is run
    Then stdout contains "No scheduled jobs" or "not active"

  @windows
  Scenario: Status shows Task Scheduler tasks
    Given the scheduled tasks exist
    When the status command is run
    Then stdout lists "ZenBackupDaily"
    And stdout lists "ZenBackupWeekly"

  @windows
  Scenario: Status shows when no scheduled tasks exist
    Given no scheduled tasks exist
    When the status command is run
    Then stdout contains "No scheduled jobs" or "not found"

  # Backup runs without user interaction
  Scenario Outline: Scheduled backup runs without user interaction
    Given the backup tool is installed on <platform>
    And no user is logged in interactively
    When the scheduled backup time is reached
    Then a backup archive is created
    And no interactive prompts are displayed

    Examples:
      | platform |
      | macos    |
      | linux    |
      | windows  |

  # Log output
  Scenario Outline: Scheduled backup output is logged
    Given the backup tool is installed on <platform>
    When a scheduled daily backup runs
    Then stdout and stderr are captured to "backup.log"
    And on Linux the output is also available in the systemd journal

    Examples:
      | platform |
      | macos    |
      | linux    |
      | windows  |

  # US-33: Scheduler Lifecycle Commands
  @macos
  Scenario: Schedule stop disables scheduled jobs without uninstalling
    Given the backup tool is installed
    When "zen-backup schedule stop" is run
    Then stdout lists "com.prometheas.zen-backup.daily: paused"
    And stdout lists "com.prometheas.zen-backup.weekly: paused"

  @macos
  Scenario: Schedule start enables paused jobs
    Given the backup tool is installed
    And "zen-backup schedule stop" was run
    When "zen-backup schedule start" is run
    Then stdout lists "com.prometheas.zen-backup.daily: active"
    And stdout lists "com.prometheas.zen-backup.weekly: active"

  @macos
  Scenario: Schedule aliases map to primary commands
    Given the backup tool is installed
    When "zen-backup schedule pause" is run
    Then stdout lists "paused"
    When "zen-backup schedule resume" is run
    Then stdout lists "active"

  @macos
  Scenario: Schedule status reports daily and weekly states
    Given the backup tool is installed
    When "zen-backup schedule status" is run
    Then stdout lists "com.prometheas.zen-backup.daily"
    And stdout lists "com.prometheas.zen-backup.weekly"

  @linux
  Scenario: Schedule stop disables systemd timers without uninstalling
    Given the backup tool is installed
    When "zen-backup schedule stop" is run
    Then stdout lists "zen-backup-daily.timer: paused"
    And stdout lists "zen-backup-weekly.timer: paused"

  @linux
  Scenario: Schedule start enables paused systemd timers
    Given the backup tool is installed
    And "zen-backup schedule stop" was run
    When "zen-backup schedule start" is run
    Then stdout lists "zen-backup-daily.timer: active"
    And stdout lists "zen-backup-weekly.timer: active"

  @linux
  Scenario: Schedule aliases map to primary commands on Linux
    Given the backup tool is installed
    When "zen-backup schedule pause" is run
    Then stdout lists "paused"
    When "zen-backup schedule resume" is run
    Then stdout lists "active"

  @linux
  Scenario: Schedule status reports daily and weekly timer states
    Given the backup tool is installed
    When "zen-backup schedule status" is run
    Then stdout lists "zen-backup-daily.timer"
    And stdout lists "zen-backup-weekly.timer"

  @windows
  Scenario: Schedule stop disables scheduled tasks without uninstalling
    Given the backup tool is installed
    When "zen-backup schedule stop" is run
    Then stdout lists "ZenBackupDaily: paused"
    And stdout lists "ZenBackupWeekly: paused"

  @windows
  Scenario: Schedule start enables paused tasks
    Given the backup tool is installed
    And "zen-backup schedule stop" was run
    When "zen-backup schedule start" is run
    Then stdout lists "ZenBackupDaily: active"
    And stdout lists "ZenBackupWeekly: active"

  @windows
  Scenario: Schedule aliases map to primary commands on Windows
    Given the backup tool is installed
    When "zen-backup schedule pause" is run
    Then stdout lists "paused"
    When "zen-backup schedule resume" is run
    Then stdout lists "active"

  @windows
  Scenario: Schedule status reports daily and weekly task states
    Given the backup tool is installed
    When "zen-backup schedule status" is run
    Then stdout lists "ZenBackupDaily"
    And stdout lists "ZenBackupWeekly"
