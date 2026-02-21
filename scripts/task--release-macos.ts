import { join } from "jsr:@std/path@1.1.4";
import {
  artifactPath,
  type BuiltArtifact,
  renderReleaseNotes,
  writeChecksumsFile,
} from "../src/release/artifacts.ts";
import { withEmbeddedVersion } from "./embedded-version.ts";

const DIST_DIR = "dist";
const TARGETS = ["aarch64-apple-darwin", "x86_64-apple-darwin"] as const;
const INSTALLER_PACKAGE_NAME = "zen-backup-macos-installer.pkg";
const INSTALLER_DMG_NAME = "zen-backup-macos-installer.dmg";

if (import.meta.main) {
  await Deno.mkdir(DIST_DIR, { recursive: true });
  const version = releaseVersion();

  const artifacts: BuiltArtifact[] = await withEmbeddedVersion(version, async () => {
    const built: BuiltArtifact[] = [];
    for (const target of TARGETS) {
      const outputPath = artifactPath(DIST_DIR, target);
      await compileBinary(target, outputPath);
      await smokeCheckBinary(outputPath);
      built.push({ path: outputPath, target });
    }

    const installerArtifacts = await buildMacosInstallerArtifacts(DIST_DIR);
    built.push(...installerArtifacts);
    return built;
  });

  await writeChecksumsFile(join(DIST_DIR, "checksums-macos.txt"), artifacts);

  const metadata = {
    version,
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

async function buildMacosInstallerArtifacts(distDir: string): Promise<BuiltArtifact[]> {
  if (Deno.build.os !== "darwin") {
    console.log("Skipping macOS installer package build on non-darwin host.");
    return [];
  }

  const pkgPath = join(distDir, INSTALLER_PACKAGE_NAME);
  const dmgPath = join(distDir, INSTALLER_DMG_NAME);
  const rootDir = await Deno.makeTempDir({ prefix: "zen-backup-pkg-root-" });
  const scriptsDir = await Deno.makeTempDir({ prefix: "zen-backup-pkg-scripts-" });
  const dmgDir = await Deno.makeTempDir({ prefix: "zen-backup-dmg-" });

  try {
    const libDir = join(rootDir, "usr", "local", "lib", "zen-backup");
    await Deno.mkdir(libDir, { recursive: true });

    for (const target of TARGETS) {
      const source = artifactPath(distDir, target);
      const destination = join(libDir, `zen-backup-${target}`);
      await Deno.copyFile(source, destination);
      await Deno.chmod(destination, 0o755);
    }

    const postInstallPath = join(scriptsDir, "postinstall");
    await Deno.writeTextFile(postInstallPath, postInstallScript());
    await Deno.chmod(postInstallPath, 0o755);

    await runCommand("pkgbuild", [
      "--root",
      rootDir,
      "--identifier",
      "com.prometheas.zen-backup",
      "--version",
      installerVersion(),
      "--scripts",
      scriptsDir,
      pkgPath,
    ]);

    await Deno.copyFile(pkgPath, join(dmgDir, INSTALLER_PACKAGE_NAME));
    await Deno.writeTextFile(join(dmgDir, "README.txt"), dmgReadmeText());

    await runCommand("hdiutil", [
      "create",
      "-volname",
      "Zen Backup Installer",
      "-srcfolder",
      dmgDir,
      "-ov",
      "-format",
      "UDZO",
      dmgPath,
    ]);

    return [
      { path: pkgPath, target: "macos-pkg-installer" },
      { path: dmgPath, target: "macos-dmg-installer" },
    ];
  } finally {
    await Deno.remove(rootDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(scriptsDir, { recursive: true }).catch(() => undefined);
    await Deno.remove(dmgDir, { recursive: true }).catch(() => undefined);
  }
}

async function runCommand(command: string, args: string[]): Promise<void> {
  const out = await new Deno.Command(command, {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!out.success) {
    throw new Error(`${command} failed with exit code ${out.code}`);
  }
}

function postInstallScript(): string {
  return `#!/bin/sh
set -eu

LIB_DIR="/usr/local/lib/zen-backup"
TARGET_PATH="/usr/local/bin/zen-backup"

mkdir -p /usr/local/bin

case "$(uname -m)" in
  arm64|aarch64)
    SOURCE_PATH="$LIB_DIR/zen-backup-aarch64-apple-darwin"
    ;;
  x86_64|amd64)
    SOURCE_PATH="$LIB_DIR/zen-backup-x86_64-apple-darwin"
    ;;
  *)
    echo "unsupported architecture for installer" >&2
    exit 1
    ;;
esac

install -m 0755 "$SOURCE_PATH" "$TARGET_PATH"
`;
}

function dmgReadmeText(): string {
  return [
    "Zen Backup macOS Installer",
    "",
    "1. Open zen-backup-macos-installer.pkg.",
    "2. Follow the installer prompts.",
    "3. Confirm install with: /usr/local/bin/zen-backup status",
  ].join("\n");
}

function installerVersion(): string {
  const explicit = releaseVersion().replace(/^v/, "");
  const sanitized = explicit.match(/^\d+(\.\d+){0,2}$/) ? explicit : "0.0.0";
  return sanitized;
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
