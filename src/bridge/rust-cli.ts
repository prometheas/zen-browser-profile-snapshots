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
  const mergedEnv = {
    ...Deno.env.toObject(),
    ...(options.env ?? {}),
  };
  const env = Object.fromEntries(
    Object.entries(mergedEnv).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
  const executablePath = options.rustCliPath ?? env.ZEN_BACKUP_RUST_CLI_BIN ?? "zen-backup";
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
