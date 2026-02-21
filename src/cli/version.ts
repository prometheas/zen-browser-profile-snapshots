import { EMBEDDED_VERSION } from "../generated/version.ts";

export async function resolveVersion(): Promise<string> {
  if (EMBEDDED_VERSION !== "dev") {
    return EMBEDDED_VERSION;
  }

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
  kind: "production" | "preview" | "other";
  semver: string;
  channel?: "alpha" | "beta";
  channelIteration?: string;
  aheadCount?: string;
  hash?: string;
  raw: string;
}

export function parseVersionForDisplay(version: string): VersionDisplayParts {
  const cleaned = version.trim();
  const productionMatch = cleaned.match(/^v?(\d+\.\d+\.\d+)$/);
  if (productionMatch) {
    const [, semver] = productionMatch;
    return {
      kind: "production",
      semver,
      raw: semver,
    };
  }

  const previewMatch = cleaned.match(
    /^v?(\d+\.\d+\.\d+)-(alpha|beta)\.(\d+)(?:-(\d+)-g?([0-9a-fA-F]+))?(?:-dirty)?$/,
  );
  if (previewMatch) {
    const [, semver, channel, channelIteration, aheadCount, hash] = previewMatch;
    const raw = `${semver}-${channel}.${channelIteration}${
      aheadCount && hash ? `-${aheadCount}-g${hash}` : ""
    }`;
    return {
      kind: "preview",
      semver,
      channel: channel as "alpha" | "beta",
      channelIteration,
      aheadCount: aheadCount || undefined,
      hash: hash || undefined,
      raw,
    };
  }

  return { kind: "other", semver: cleaned, raw: cleaned };
}
