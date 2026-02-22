import type { RuntimeOptions } from "../types.ts";

export interface OpenBrowserResult {
  ok: boolean;
  error?: string;
}

export async function openBrowserUrl(
  url: string,
  options: RuntimeOptions = {},
): Promise<OpenBrowserResult> {
  const env = options.env ?? Deno.env.toObject();
  if (env.ZEN_BACKUP_TEST_BROWSER_OPEN === "1") {
    return { ok: true };
  }
  if (env.ZEN_BACKUP_TEST_BROWSER_OPEN === "0") {
    return { ok: false, error: "simulated browser open failure" };
  }

  const os = options.os ?? Deno.build.os;
  const command = os === "darwin"
    ? ["open", url]
    : os === "windows"
    ? ["cmd", "/c", "start", "", url]
    : ["xdg-open", url];

  const out = await new Deno.Command(command[0], {
    args: command.slice(1),
    stdout: "null",
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

  if (!out.success) {
    return {
      ok: false,
      error: new TextDecoder().decode(out.stderr).trim() || "failed to open browser",
    };
  }

  return { ok: true };
}

function normalizeEnv(env: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([, value]) => value !== undefined),
  ) as Record<string, string>;
}
