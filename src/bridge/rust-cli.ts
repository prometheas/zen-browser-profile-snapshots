import type { RuntimeOptions } from "../types.ts";

export interface RustCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runRustCli(
  args: string[],
  options: RuntimeOptions = {},
): Promise<RustCliResult> {
  const bridgeEnv: Record<string, string | undefined> = {
    ...(options.env ?? {}),
  };
  if (options.os) {
    bridgeEnv.ZEN_BACKUP_TEST_OS = options.os;
  }
  if (options.now) {
    bridgeEnv.ZEN_BACKUP_TEST_NOW = options.now.toISOString();
  }
  if (options.version) {
    bridgeEnv.ZEN_BACKUP_TEST_VERSION = options.version;
  }

  const mergedEnv = {
    ...Deno.env.toObject(),
    ...bridgeEnv,
  };
  const env = Object.fromEntries(
    Object.entries(mergedEnv).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const executablePath = await resolveRustCliPath(options, env);
  const output = await runCommandWithFallback(executablePath, args, env, options.cwd);
  return {
    exitCode: output.code,
    stdout: new TextDecoder().decode(output.stdout).trimEnd(),
    stderr: new TextDecoder().decode(output.stderr).trimEnd(),
  };
}

async function resolveRustCliPath(
  options: RuntimeOptions,
  env: Record<string, string>,
): Promise<string> {
  if (options.rustCliPath && options.rustCliPath.trim().length > 0) {
    return options.rustCliPath;
  }
  if (env.ZEN_BACKUP_RUST_CLI_BIN && env.ZEN_BACKUP_RUST_CLI_BIN.trim().length > 0) {
    return env.ZEN_BACKUP_RUST_CLI_BIN;
  }

  const workspaceRoot = new URL("../../", import.meta.url);
  const devBinaryName = Deno.build.os === "windows" ? "zen-backup.exe" : "zen-backup";
  const devBinary = new URL(`target/debug/${devBinaryName}`, workspaceRoot);
  if (await exists(devBinary)) {
    return fileUrlToPath(devBinary);
  }

  return "zen-backup";
}

async function runCommandWithFallback(
  executablePath: string,
  args: string[],
  env: Record<string, string>,
  cwd?: string,
): Promise<Deno.CommandOutput> {
  try {
    return await new Deno.Command(executablePath, {
      args,
      env,
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
  } catch (error) {
    if (!(error instanceof Deno.errors.NotFound) || executablePath !== "zen-backup") {
      throw error;
    }
    return await new Deno.Command("cargo", {
      args: [
        "run",
        "--quiet",
        "--manifest-path",
        resolveManifestPath(),
        "--",
        ...args,
      ],
      env,
      cwd,
      stdout: "piped",
      stderr: "piped",
    }).output();
  }
}

async function exists(pathUrl: URL): Promise<boolean> {
  try {
    await Deno.stat(pathUrl);
    return true;
  } catch {
    return false;
  }
}

function resolveManifestPath(): string {
  const workspaceRoot = new URL("../../", import.meta.url);
  return fileUrlToPath(new URL("rust/zen-backup/Cargo.toml", workspaceRoot));
}

function fileUrlToPath(pathUrl: URL): string {
  const decoded = decodeURIComponent(pathUrl.pathname);
  if (Deno.build.os === "windows") {
    return decoded.replace(/^\/([A-Za-z]:)/, "$1").replaceAll("/", "\\");
  }
  return decoded;
}
