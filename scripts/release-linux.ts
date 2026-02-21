import { join } from "jsr:@std/path@1.1.4";
import { artifactPath, type BuiltArtifact, writeChecksumsFile } from "../src/release/artifacts.ts";

const distDir = "dist";
const targets = ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu"] as const;

if (import.meta.main) {
  await Deno.mkdir(distDir, { recursive: true });

  const artifacts: BuiltArtifact[] = [];
  for (const target of targets) {
    const outputPath = artifactPath(distDir, target);
    await compileBinary(target, outputPath);
    await smokeCheckBinary(outputPath);
    artifacts.push({ path: outputPath, target });
  }

  await writeChecksumsFile(join(distDir, "checksums-linux.txt"), artifacts);
  await Deno.writeTextFile(
    join(distDir, "release-notes-linux.md"),
    renderLinuxReleaseNotes(
      {
        version: releaseVersion(),
        date: new Date().toISOString().slice(0, 10),
        commit: await gitCommitSha(),
      },
      artifacts,
    ),
  );

  console.log("Built Linux release artifacts:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact.path}`);
  }
  console.log("- dist/checksums-linux.txt");
  console.log("- dist/release-notes-linux.md");
}

async function compileBinary(target: string, outputPath: string): Promise<void> {
  const out = await new Deno.Command("deno", {
    args: [
      "compile",
      "--allow-all",
      "--target",
      target,
      "--output",
      outputPath,
      "src/main.ts",
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!out.success) {
    throw new Error(`compile failed for target ${target}`);
  }
}

async function smokeCheckBinary(path: string): Promise<void> {
  const out = await new Deno.Command(path, {
    args: [],
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stderr = new TextDecoder().decode(out.stderr);
  if (out.code !== 1 || !stderr.includes("Usage: zen-backup")) {
    throw new Error(`smoke check failed for ${path}`);
  }
}

function renderLinuxReleaseNotes(
  metadata: { version: string; date: string; commit: string },
  artifacts: BuiltArtifact[],
): string {
  const artifactLines = artifacts.map((artifact) =>
    `- \`${artifact.path.split("/").at(-1)}\` (${artifact.target})`
  );
  return `# Zen Backup ${metadata.version}

Release date: ${metadata.date}
Commit: ${metadata.commit}

## Release Type

- Beta / technical preview for Linux users.

## Included In This Linux Beta

- Manual backup commands: \`backup daily\`, \`backup weekly\`
- Restore command with pre-restore safety copy: \`restore <archive>\`
- Snapshot visibility commands: \`list\`, \`status\`
- Linux install/uninstall flow with systemd user timer generation
- Schedule management commands: \`schedule start|stop|status\` with \`resume/pause\` aliases
- Linux notification integration via \`notify-send\` with log fallback

## Artifacts

${artifactLines.join("\n")}

## Checksums

- SHA-256 checksums are provided in \`checksums-linux.txt\`.

## Smoke Validation

- Each Linux binary was executed with no arguments and returned CLI usage output.

## Planned Before Stable

- Real-world systemd verification on clean Ubuntu and Debian hosts
- Linux installer hardening across desktop/non-desktop sessions
- Windows parity completion for cross-platform stable release
`;
}

function releaseVersion(): string {
  const explicit = Deno.env.get("RELEASE_VERSION");
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  return `0.3.0-dev.${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
}

async function gitCommitSha(): Promise<string> {
  const out = await new Deno.Command("git", {
    args: ["rev-parse", "--short", "HEAD"],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return "unknown";
  return new TextDecoder().decode(out.stdout).trim() || "unknown";
}
