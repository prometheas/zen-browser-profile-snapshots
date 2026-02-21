const SMOKE_FLAG = "ZEN_BACKUP_LIVE_SMOKE";

if (import.meta.main) {
  if (Deno.build.os !== "darwin") {
    console.error("macOS scheduler smoke test can only run on darwin.");
    Deno.exit(1);
  }
  if (Deno.env.get(SMOKE_FLAG) !== "1") {
    console.error(
      `Refusing to run live launchctl smoke test without ${SMOKE_FLAG}=1.`,
    );
    Deno.exit(1);
  }

  const initial = await schedulerStates();
  if (initial.size === 0 || [...initial.values()].every((s) => s === "not_installed")) {
    console.log("No installed scheduler jobs found; skipping live smoke test.");
    Deno.exit(0);
  }

  await run(["schedule", "stop"]);
  const stopped = await schedulerStates();
  assertAll(stopped, "paused", "stop");

  if ([...initial.values()].some((s) => s === "active")) {
    await run(["schedule", "start"]);
    const started = await schedulerStates();
    assertAll(started, "active", "start");
  } else {
    console.log("Initial state was paused; leaving scheduler paused.");
  }

  console.log("Live macOS scheduler smoke test passed.");
}

async function schedulerStates(): Promise<Map<string, string>> {
  const out = await run(["schedule", "status"]);
  const states = new Map<string, string>();
  for (const line of out.trim().split("\n")) {
    const parts = line.split(":").map((p) => p.trim());
    if (parts.length !== 2) continue;
    const [label, state] = parts;
    if (!label.startsWith("com.prometheas.zen-backup.")) continue;
    states.set(label, state);
  }
  return states;
}

function assertAll(states: Map<string, string>, expected: string, action: string): void {
  for (const [label, state] of states) {
    if (state !== expected) {
      throw new Error(`schedule ${action} failed: expected ${label}=${expected}, got ${state}`);
    }
  }
}

async function run(args: string[]): Promise<string> {
  const cmd = new Deno.Command("deno", {
    args: ["run", "-A", "src/main.ts", ...args],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  const stdout = new TextDecoder().decode(out.stdout);
  const stderr = new TextDecoder().decode(out.stderr);
  if (!out.success) {
    const detail = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
    throw new Error(`command failed: zen-backup ${args.join(" ")}\n${detail}`);
  }
  return stdout;
}
