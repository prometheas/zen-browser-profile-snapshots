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

export interface VersionDisplayParts {
  semver: string;
  suffix?: string;
  hash?: string;
}

export function parseVersionForDisplay(version: string): VersionDisplayParts {
  const cleaned = version.trim();
  const describeMatch = cleaned.match(
    /^v?(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?-\d+-g([0-9a-fA-F]+)(?:-dirty)?$/,
  );
  if (describeMatch) {
    const [, semver, suffix, hash] = describeMatch;
    return {
      semver,
      suffix: suffix || undefined,
      hash: hash || undefined,
    };
  }

  const taggedMatch = cleaned.match(/^v?(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (taggedMatch) {
    const [, semver, suffix] = taggedMatch;
    return {
      semver,
      suffix: suffix || undefined,
    };
  }
  return { semver: cleaned };
}
