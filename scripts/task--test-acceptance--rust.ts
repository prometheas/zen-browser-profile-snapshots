const mode = Deno.args[0] ?? "smoke";

if (mode !== "smoke") {
  console.error(
    "Usage: deno run -A scripts/task--test-acceptance--rust.ts <smoke>",
  );
  Deno.exit(1);
}

const cargoArgs = ["test", "-p", "zen-backup", "--test", "acceptance-rust"];
const command = new Deno.Command(await resolveRunner(), {
  args: await resolveArgs(cargoArgs),
  stdout: "inherit",
  stderr: "inherit",
});

const result = await command.output();
Deno.exit(result.code);

async function resolveRunner(): Promise<string> {
  return await commandExists("cargo") ? "cargo" : "nix";
}

async function resolveArgs(cargoArgs: string[]): Promise<string[]> {
  return await commandExists("cargo") ? cargoArgs : ["develop", "-c", "cargo", ...cargoArgs];
}

async function commandExists(command: string): Promise<boolean> {
  try {
    const output = await new Deno.Command(command, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return output.success;
  } catch {
    return false;
  }
}
