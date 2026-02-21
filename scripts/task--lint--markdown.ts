#!/usr/bin/env -S deno run --allow-run --allow-read

const trackedMarkdown = await new Deno.Command("git", {
  args: ["ls-files", "--", ":(glob)**/*.md"],
  stdout: "piped",
  stderr: "piped",
}).output();

if (!trackedMarkdown.success) {
  console.error(new TextDecoder().decode(trackedMarkdown.stderr).trim());
  Deno.exit(trackedMarkdown.code);
}

const markdownFiles = new TextDecoder()
  .decode(trackedMarkdown.stdout)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0)
  .filter((line) => !isExcludedPath(line));

if (markdownFiles.length === 0) {
  console.log("No tracked Markdown files found.");
  Deno.exit(0);
}

const lintCommand = new Deno.Command("deno", {
  args: [
    "run",
    "--allow-read",
    "--allow-sys",
    "npm:markdownlint-cli2",
    "--config",
    ".config/.markdownlint.json",
    ...markdownFiles,
  ],
  stdout: "inherit",
  stderr: "inherit",
});

const { code } = await lintCommand.output();
Deno.exit(code);

function isExcludedPath(path: string): boolean {
  const excludedPrefixes = [
    ".agents/",
    ".claude/skills/",
    ".github/skills/",
    ".direnv/",
    "dist/",
    "docs/plans/",
    "skills/",
  ];
  if (excludedPrefixes.some((prefix) => path.startsWith(prefix))) {
    return true;
  }
  return path.includes("/worktrees/") || path.startsWith(".worktrees/");
}
