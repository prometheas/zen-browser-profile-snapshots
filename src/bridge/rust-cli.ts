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
  const command = new Deno.Command(executablePath, {
    args,
    env,
    cwd: options.cwd,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
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
  const devBinary = new URL("target/debug/zen-backup", workspaceRoot);
  if (await exists(devBinary)) {
    return fromFileUrl(devBinary);
  }

  return "zen-backup";
}

async function exists(pathUrl: URL): Promise<boolean> {
  try {
    await Deno.stat(pathUrl);
    return true;
  } catch {
    return false;
  }
}

function fromFileUrl(pathUrl: URL): string {
  return decodeURIComponent(pathUrl.pathname);
}
