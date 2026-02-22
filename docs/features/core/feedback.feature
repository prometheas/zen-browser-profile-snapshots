@core
Feature: Feedback submission
  As a Zen Backup user
  I want to submit bug reports and feature requests from the CLI
  So that I can share actionable feedback quickly

  Scenario: Submit bug feedback via GitHub CLI
    Given GitHub CLI is available
    And feedback answers are provided:
      | field                | value                    |
      | title                | Backup fails on startup  |
      | description          | It crashes immediately.  |
      | steps_to_reproduce   | Run backup daily         |
      | expected_behavior    | Backup succeeds          |
    When the feedback bug command is run
    Then the exit code is 0
    And stdout contains "Created issue:"

  Scenario: Submit request feedback via GitHub CLI
    Given GitHub CLI is available
    And feedback answers are provided:
      | field      | value                        |
      | title      | Add encrypted archives       |
      | problem    | Need at-rest protection      |
      | solution   | Add password-based encryption |
      | platforms  | all                          |
    When the feedback request command is run
    Then the exit code is 0
    And stdout contains "Created issue:"

  Scenario: Fallback to browser when GitHub CLI is unavailable
    Given GitHub CLI is unavailable
    And feedback answers are provided:
      | field      | value                  |
      | title      | Better progress output |
      | problem    | Hard to track progress |
      | solution   | Show percentages       |
      | platforms  | all                    |
    When the feedback request command is run
    Then the exit code is 0
    And stdout contains "Opened feedback URL:"
