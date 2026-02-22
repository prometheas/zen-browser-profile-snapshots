import type { RuntimeOptions } from "../types.ts";

export interface GitHubIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface GitHubIssueCreateResult {
  ok: boolean;
  url?: string;
  error?: string;
}

export async function isGitHubCliAvailable(options: RuntimeOptions = {}): Promise<boolean> {
  const env = options.env ?? Deno.env.toObject();
  if (env.ZEN_BACKUP_TEST_GH_AVAILABLE === "1") return true;
  if (env.ZEN_BACKUP_TEST_GH_AVAILABLE === "0") return false;

  const out = await new Deno.Command("gh", {
    args: ["--version"],
    stdout: "null",
    stderr: "null",
    env: normalizeEnv(env),
  }).output().catch(() => null);

  return out?.success ?? false;
}

export async function createGitHubIssue(
  input: GitHubIssueInput,
  options: RuntimeOptions = {},
): Promise<GitHubIssueCreateResult> {
  const env = options.env ?? Deno.env.toObject();
  if (env.ZEN_BACKUP_TEST_GH_AVAILABLE === "1") {
    return {
      ok: true,
      url: env.ZEN_BACKUP_TEST_GH_CREATED_URL ??
        "https://github.com/prometheas/zen-browser-profile-snapshots/issues/1",
    };
  }

  const args = ["issue", "create", "--title", input.title, "--body", input.body];
  for (const label of input.labels) {
    args.push("--label", label);
  }
  if (env.ZEN_BACKUP_GH_REPO) {
    args.push("--repo", env.ZEN_BACKUP_GH_REPO);
  }

  const out = await new Deno.Command("gh", {
    args,
    stdout: "piped",
    stderr: "piped",
    env: normalizeEnv(env),
  }).output().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      code: 1,
      stdout: new Uint8Array(),
      stderr: new TextEncoder().encode(message),
      signal: null,
    };
  });

  const stdout = new TextDecoder().decode(out.stdout).trim();
  const stderr = new TextDecoder().decode(out.stderr).trim();
  if (!out.success) {
    return { ok: false, error: stderr || "gh issue create failed" };
  }

  return {
    ok: true,
    url: stdout.split("\n").at(-1) ?? "",
  };
}

function normalizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  ) as Record<
    string,
    string
  >;
}
