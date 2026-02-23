import { runRustCli } from "./bridge/rust-cli.ts";
import type { RuntimeOptions } from "./types.ts";

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(args: string[], options: RuntimeOptions = {}): Promise<CliResult> {
  return await runRustCli(args, options);
}

if (import.meta.main) {
  const result = await runCli(Deno.args);
  if (result.stdout.trim().length > 0) {
    console.log(result.stdout);
  }
  if (result.stderr.trim().length > 0) {
    console.error(result.stderr);
  }
  Deno.exit(result.exitCode);
}
