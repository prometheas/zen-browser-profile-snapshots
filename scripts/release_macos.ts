import { join } from "jsr:@std/path@1.1.4";
import {
  artifactPath,
  renderReleaseNotes,
  writeChecksumsFile,
  type BuiltArtifact,
} from "../src/release/artifacts.ts";

const DIST_DIR = "dist";
const TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin"] as const;

if (import.meta.main) {
  await Deno.mkdir(DIST_DIR, { recursive: true });

  const artifacts: BuiltArtifact[] = [];
  for (const target of TARGETS) {
    const outputPath = artifactPath(DIST_DIR, target);
    await compileBinary(target, outputPath);
    await smokeCheckBinary(outputPath);
    artifacts.push({ path: outputPath, target });
  }

  await writeChecksumsFile(join(DIST_DIR, "checksums-macos.txt"), artifacts);

  const metadata = {
    version: releaseVersion(),
    date: new Date().toISOString().slice(0, 10),
    commit: await gitCommitSha(),
  };
  const notes = renderReleaseNotes(metadata, artifacts);
  await Deno.writeTextFile(join(DIST_DIR, "release-notes-macos.md"), notes);

  console.log("Built macOS release artifacts:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact.path}`);
  }
  console.log("- dist/checksums-macos.txt");
  console.log("- dist/release-notes-macos.md");
}

async function compileBinary(target: string, outputPath: string): Promise<void> {
  const cmd = new Deno.Command("deno", {
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
  });
  const out = await cmd.output();
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

function releaseVersion(): string {
  const explicit = Deno.env.get("RELEASE_VERSION");
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  return `0.1.0-dev.${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
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
