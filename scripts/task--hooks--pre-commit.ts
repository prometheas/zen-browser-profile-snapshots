#!/usr/bin/env -S deno run --allow-run --allow-read

const startTime = performance.now();
const WARN_THRESHOLD_MS = 30_000;

interface CheckResult {
  name: string;
  success: boolean;
}

async function runCheck(name: string, args: string[]): Promise<CheckResult> {
  console.log(`\n▶ ${name}...`);
  const command = new Deno.Command("deno", {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await command.output();
  return { name, success: code === 0 };
}

const checks: CheckResult[] = [];

// 1. Format check
checks.push(await runCheck("Checking formatting", ["fmt", "--check"]));
if (!checks.at(-1)?.success) {
  console.error("\n✗ Formatting check failed. Run 'deno fmt' to fix.");
  Deno.exit(1);
}

// 2. Deno lint
checks.push(await runCheck("Running deno lint", ["lint", "src", "tests"]));
if (!checks.at(-1)?.success) {
  console.error("\n✗ Deno lint failed.");
  Deno.exit(1);
}

// 3. Markdown lint
checks.push(
  await runCheck("Running markdown lint", [
    "run",
    "--allow-run",
    "--allow-read",
    "scripts/task--lint--markdown.ts",
  ]),
);
if (!checks.at(-1)?.success) {
  console.error("\n✗ Markdown lint failed.");
  Deno.exit(1);
}

// 4. Unit tests
checks.push(await runCheck("Running unit tests", ["task", "test:unit"]));
if (!checks.at(-1)?.success) {
  console.error("\n✗ Unit tests failed.");
  Deno.exit(1);
}

// Report timing
const elapsed = performance.now() - startTime;
const elapsedSec = (elapsed / 1000).toFixed(1);

console.log(`\n✓ All checks passed (${elapsedSec}s)`);

if (elapsed > WARN_THRESHOLD_MS) {
  console.warn(
    `\n⚠ Pre-commit took ${elapsedSec}s (>${WARN_THRESHOLD_MS / 1000}s threshold)`,
  );
}

Deno.exit(0);
