if (import.meta.main) {
  const [target, outputPath] = Deno.args;
  if (!target || !outputPath) {
    console.error("Usage: deno run -A scripts/build-target.ts <target> <output-path>");
    Deno.exit(1);
  }

  await buildTarget(target, outputPath);
}

export async function buildTarget(target: string, outputPath: string): Promise<void> {
  const build = await new Deno.Command("cargo", {
    args: ["build", "--release", "--target", target, "-p", "zen-backup"],
    stdout: "inherit",
    stderr: "inherit",
    env: releaseEnv(),
  }).output();
  if (!build.success) {
    throw new Error(`cargo build failed for target ${target}`);
  }

  const binaryName = target.includes("windows") ? "zen-backup.exe" : "zen-backup";
  const sourcePath = `target/${target}/release/${binaryName}`;
  await Deno.copyFile(sourcePath, outputPath);
  if (!target.includes("windows")) {
    await Deno.chmod(outputPath, 0o755);
  }
}

function releaseEnv(): Record<string, string> {
  const env = Deno.env.toObject();
  const version = env.RELEASE_VERSION?.trim();
  if (!version) return env;
  return { ...env, RELEASE_VERSION: version };
}
