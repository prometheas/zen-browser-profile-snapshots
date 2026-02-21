#!/usr/bin/env -S deno run --allow-read --allow-write

const hookContent = `#!/bin/sh
# Installed by scripts/install-hooks.ts
exec deno run --allow-run --allow-read scripts/hooks--pre-commit.ts
`;

const hookPath = ".git/hooks/pre-commit";

await Deno.writeTextFile(hookPath, hookContent);
await Deno.chmod(hookPath, 0o755);

console.log(`✓ Installed pre-commit hook at ${hookPath}`);
