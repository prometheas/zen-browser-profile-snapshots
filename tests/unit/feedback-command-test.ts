import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { buildFeedbackIssue, runFeedback } from "../../src/commands/feedback.ts";

Deno.test("feedback bug builds bug-labeled issue payload", () => {
  const issue = buildFeedbackIssue("bug", {
    title: "Backup crashes",
    description: "Crashes on startup",
    steps_to_reproduce: "Run backup daily",
    expected_behavior: "Backup should finish",
  });

  assertEquals(issue.labels, ["bug", "triage"]);
  assertStringIncludes(issue.title, "[Bug]: Backup crashes");
  assertStringIncludes(issue.body, "## Description");
});

Deno.test("feedback request builds enhancement-labeled issue payload", () => {
  const issue = buildFeedbackIssue("request", {
    title: "Encrypted backups",
    problem: "Need stronger privacy",
    solution: "Add password protection",
    platforms: "all",
  });

  assertEquals(issue.labels, ["feature", "enhancement"]);
  assertStringIncludes(issue.title, "[Feature]: Encrypted backups");
  assertStringIncludes(issue.body, "## Proposed Solution");
});

Deno.test("feedback bug succeeds via gh transport when available", async () => {
  const result = await runFeedback("bug", {
    env: {
      ZEN_BACKUP_TEST_GH_AVAILABLE: "1",
      ZEN_BACKUP_TEST_FEEDBACK_ANSWERS: JSON.stringify({
        title: "Backup fails",
        description: "It fails",
        steps_to_reproduce: "run",
        expected_behavior: "works",
      }),
    },
  });

  assertEquals(result.exitCode, 0);
  assertStringIncludes(result.stdout.join("\n"), "Created issue:");
});

Deno.test("invalid feedback subtype exits with help guidance", async () => {
  const result = await runFeedback("invalid", { env: {} });

  assertEquals(result.exitCode, 1);
  assertStringIncludes(result.stderr.join("\n"), "Usage: zen-backup feedback <bug|request>");
});
