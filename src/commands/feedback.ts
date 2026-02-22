import { createGitHubIssue, isGitHubCliAvailable } from "../platform/github-cli.ts";
import type { RuntimeOptions } from "../types.ts";

interface FeedbackIssue {
  title: string;
  body: string;
  labels: string[];
}

interface FeedbackAnswers {
  [key: string]: string;
}

const usage = "Usage: zen-backup feedback <bug|request>";

export async function runFeedback(
  kind: string,
  options: RuntimeOptions = {},
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  if (kind !== "bug" && kind !== "request") {
    return { exitCode: 1, stdout, stderr: [usage] };
  }

  try {
    const answers = collectAnswers(kind, options.env ?? Deno.env.toObject());
    const issue = buildFeedbackIssue(kind, answers);

    const hasGh = await isGitHubCliAvailable(options);
    if (!hasGh) {
      return { exitCode: 1, stdout, stderr: ["GitHub CLI not found.", usage] };
    }

    const created = await createGitHubIssue(issue, options);
    if (!created.ok) {
      return { exitCode: 1, stdout, stderr: [created.error ?? "Failed to create issue."] };
    }

    stdout.push(`Created issue: ${created.url ?? ""}`);
    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { exitCode: 1, stdout, stderr: [message] };
  }
}

export function buildFeedbackIssue(
  kind: "bug" | "request",
  answers: FeedbackAnswers,
): FeedbackIssue {
  if (kind === "bug") {
    const title = answers.title?.trim() || "Untitled bug";
    return {
      title: `[Bug]: ${title}`,
      labels: ["bug", "triage"],
      body: [
        "## Description",
        answers.description ?? "",
        "",
        "## Steps to Reproduce",
        answers.steps_to_reproduce ?? "",
        "",
        "## Expected Behavior",
        answers.expected_behavior ?? "",
      ].join("\n"),
    };
  }

  const title = answers.title?.trim() || "Untitled feature";
  return {
    title: `[Feature]: ${title}`,
    labels: ["feature", "enhancement"],
    body: [
      "## Problem Statement",
      answers.problem ?? "",
      "",
      "## Proposed Solution",
      answers.solution ?? "",
      "",
      "## Relevant Platforms",
      answers.platforms ?? "all",
    ].join("\n"),
  };
}

function collectAnswers(
  kind: "bug" | "request",
  env: Record<string, string | undefined>,
): FeedbackAnswers {
  const prefilled = env.ZEN_BACKUP_TEST_FEEDBACK_ANSWERS;
  if (prefilled) return JSON.parse(prefilled) as FeedbackAnswers;

  const fields = kind === "bug"
    ? ["title", "description", "steps_to_reproduce", "expected_behavior"]
    : ["title", "problem", "solution", "platforms"];
  const out: FeedbackAnswers = {};

  for (const field of fields) {
    const value = prompt(`feedback ${field}:`)?.trim();
    if (!value) {
      throw new Error(`missing required field: ${field}`);
    }
    out[field] = value;
  }
  return out;
}
