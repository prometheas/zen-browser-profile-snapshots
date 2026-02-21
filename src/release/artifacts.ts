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
  const artifactLines = artifacts.map((artifact) =>
    `- \`${basename(artifact.path)}\` (${artifact.target})`
  );
  return `# Zen Backup ${metadata.version}

Release date: ${metadata.date}
Commit: ${metadata.commit}

## Release Type
- Alpha / technical preview for macOS users.

## Included In This Alpha
- Manual backup commands: \`backup daily\`, \`backup weekly\`
- Restore command with pre-restore safety copy: \`restore <archive>\`
- Snapshot visibility commands: \`list\`, \`status\`
- Schedule management commands: \`schedule start|stop|status\` with \`resume/pause\` aliases
- Retention pruning for local and cloud backup directories
- macOS install/uninstall flow with launchd plist generation
- launchd job namespace: \`com.prometheas.zen-backup.*\`
- Release artifacts for Apple Silicon and Intel macOS binaries

## Artifacts
${artifactLines.join("\n")}

## Checksums
- SHA-256 checksums are provided in \`checksums-macos.txt\`.

## Smoke Validation
- Each binary was executed with no arguments and returned CLI usage output.

## Planned Before Stable
- Harden native launchd lifecycle integration with real \`launchctl\` verification
- Harden macOS native notification path (\`osascript\`) with fallback behavior
- Additional restore safety tests and rollback guarantees for edge-case archives
- Broader real-world smoke testing on clean Intel and Apple Silicon macOS systems
`;
}

export function artifactPath(distDir: string, target: string): string {
  return join(distDir, `zen-backup-${target}`);
}
