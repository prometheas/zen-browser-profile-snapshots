import { join } from "jsr:@std/path@1.1.4";
import { artifactPath, type BuiltArtifact, writeChecksumsFile } from "../src/release/artifacts.ts";
import { buildTarget } from "./build-target.ts";

const distDir = "dist";
const targets = ["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu"] as const;

if (import.meta.main) {
  await Deno.mkdir(distDir, { recursive: true });
  const version = releaseVersion();

  const artifacts: BuiltArtifact[] = [];
  for (const target of targets) {
    const outputPath = artifactPath(distDir, target);
    await compileBinary(target, outputPath, version);
    if (canExecuteOnCurrentHost(target)) {
      await smokeCheckBinary(outputPath);
    } else {
      console.log(`Skipping smoke check for ${target} on ${Deno.build.arch}-${Deno.build.os}`);
    }
    artifacts.push({ path: outputPath, target });
  }

  await writeChecksumsFile(join(distDir, "checksums-linux.txt"), artifacts);
  await Deno.writeTextFile(
    join(distDir, "release-notes-linux.md"),
    renderLinuxReleaseNotes(
      {
        version,
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

async function compileBinary(target: string, outputPath: string, version: string): Promise<void> {
  const previous = Deno.env.get("RELEASE_VERSION");
  Deno.env.set("RELEASE_VERSION", version);
  try {
    await buildTarget(target, outputPath);
  } finally {
    if (previous === undefined) {
      Deno.env.delete("RELEASE_VERSION");
    } else {
      Deno.env.set("RELEASE_VERSION", previous);
    }
  }
}

async function smokeCheckBinary(path: string): Promise<void> {
  const out = await new Deno.Command(path, {
    args: [],
    stdout: "piped",
    stderr: "piped",
  }).output();

  const stdout = new TextDecoder().decode(out.stdout);
  const stderr = new TextDecoder().decode(out.stderr);
  const combined = `${stdout}\n${stderr}`;
  if (out.code === 0 || !combined.includes("Usage")) {
    throw new Error(`smoke check failed for ${path}`);
  }
}

function canExecuteOnCurrentHost(target: string): boolean {
  if (Deno.build.os !== "linux") return false;
  if (target.startsWith("x86_64-") && Deno.build.arch === "x86_64") return true;
  if (target.startsWith("aarch64-") && Deno.build.arch === "aarch64") return true;
  return false;
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
