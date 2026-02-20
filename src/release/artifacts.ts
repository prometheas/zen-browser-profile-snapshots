import { basename, join } from "jsr:@std/path@1.1.4";

export interface BuiltArtifact {
  path: string;
  target: string;
}

export interface ReleaseMetadata {
  version: string;
  date: string;
  commit: string;
}

export async function sha256File(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function writeChecksumsFile(
  outputPath: string,
  artifacts: BuiltArtifact[],
): Promise<void> {
  const lines: string[] = [];
  for (const artifact of artifacts) {
    const sum = await sha256File(artifact.path);
    lines.push(`${sum}  ${basename(artifact.path)}`);
  }
  await Deno.writeTextFile(outputPath, `${lines.join("\n")}\n`);
}

export function renderReleaseNotes(metadata: ReleaseMetadata, artifacts: BuiltArtifact[]): string {
  const artifactLines = artifacts.map((artifact) => `- \`${basename(artifact.path)}\` (${artifact.target})`);
  return `# Zen Backup ${metadata.version}

Release date: ${metadata.date}
Commit: ${metadata.commit}

## Artifacts
${artifactLines.join("\n")}

## Checksums
- SHA-256 checksums are provided in \`checksums-macos.txt\`.

## Smoke Validation
- Each binary was executed with no arguments and returned CLI usage output.
`;
}

export function artifactPath(distDir: string, target: string): string {
  return join(distDir, `zen-backup-${target}`);
}
