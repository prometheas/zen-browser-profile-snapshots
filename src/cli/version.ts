export async function resolveVersion(): Promise<string> {
  const fromEnv = Deno.env.get("ZEN_BACKUP_VERSION");
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.trim();

  const git = await new Deno.Command("git", {
    args: ["describe", "--tags", "--always", "--dirty"],
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => null);

  if (git && git.success) {
    const value = new TextDecoder().decode(git.stdout).trim();
    if (value.length > 0) return value;
  }
  return "dev";
}
