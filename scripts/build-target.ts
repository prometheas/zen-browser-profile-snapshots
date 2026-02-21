import { withEmbeddedVersion } from "./embedded-version.ts";

if (import.meta.main) {
  const [target, outputPath] = Deno.args;
  if (!target || !outputPath) {
    console.error("Usage: deno run -A scripts/build-target.ts <target> <output-path>");
    Deno.exit(1);
  }

  const version = (Deno.env.get("RELEASE_VERSION") || await gitDescribeVersion() || "dev").trim();
  await withEmbeddedVersion(version, async () => {
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
  });
}

async function gitDescribeVersion(): Promise<string | null> {
  const out = await new Deno.Command("git", {
    args: ["describe", "--tags", "--always", "--dirty"],
    stdout: "piped",
    stderr: "null",
  }).output().catch(() => null);

  if (!out || !out.success) return null;
  const value = new TextDecoder().decode(out.stdout).trim();
  return value.length > 0 ? value : null;
}
