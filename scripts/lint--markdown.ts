#!/usr/bin/env -S deno run --allow-run --allow-read

const command = new Deno.Command("deno", {
  args: [
    "run",
    "--allow-read",
    "--allow-sys",
    "npm:markdownlint-cli2",
    "--config",
    ".config/.markdownlint.json",
    "**/*.md",
    "#.agents",
    "#.claude/skills",
    "#skills",
    "#.github/skills",
    "#.direnv",
    "#dist",
    "#docs/plans",
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await command.output();
Deno.exit(code);
