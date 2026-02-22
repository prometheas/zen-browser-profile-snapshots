import { join } from "jsr:@std/path@1.1.4";
import { type BuiltArtifact, writeChecksumsFile } from "../src/release/artifacts.ts";
import { withEmbeddedVersion } from "./embedded-version.ts";

const distDir = "dist";
const target = "x86_64-pc-windows-msvc";

if (import.meta.main) {
  await Deno.mkdir(distDir, { recursive: true });
  const version = releaseVersion();

  const artifacts: BuiltArtifact[] = await withEmbeddedVersion(version, async () => {
    const outputPath = windowsArtifactPath(target);
    await compileBinary(target, outputPath);
    if (Deno.build.os === "windows") {
      await smokeCheckBinary(outputPath);
    } else {
      console.log(`Skipping smoke check for ${target} on ${Deno.build.os}.`);
    }
    return [{ path: outputPath, target }];
  });

  await writeChecksumsFile(join(distDir, "checksums-windows.txt"), artifacts);

  console.log("Built Windows release artifacts:");
  for (const artifact of artifacts) {
    console.log(`- ${artifact.path}`);
  }
  console.log("- dist/checksums-windows.txt");
}

function windowsArtifactPath(targetTriple: string): string {
  return join(distDir, `zen-backup-${targetTriple}.exe`);
}

async function compileBinary(targetTriple: string, outputPath: string): Promise<void> {
  const out = await new Deno.Command("deno", {
    args: [
      "compile",
      "--allow-all",
      "--target",
      targetTriple,
      "--output",
      outputPath,
      "src/main.ts",
    ],
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!out.success) {
    throw new Error(`compile failed for target ${targetTriple}`);
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

function releaseVersion(): string {
  const explicit = Deno.env.get("RELEASE_VERSION");
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  return `0.4.0-dev.${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`;
}
