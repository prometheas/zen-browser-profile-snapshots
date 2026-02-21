import { basename } from "jsr:@std/path@1.1.4";

interface CommitInfo {
  sha: string;
  subject: string;
  type: string;
}

const distDir = "dist";

if (import.meta.main) {
  await Deno.mkdir(distDir, { recursive: true });

  const version = releaseVersion();
  const currentTag = version;
  const previousTag = await previousTagBefore(currentTag);
  const commits = await commitsSince(previousTag);
  const artifacts = await releaseArtifacts();

  const notes = renderCombinedReleaseNotes({
    version,
    date: new Date().toISOString().slice(0, 10),
    commit: await gitCommitSha(),
    previousTag,
    commits,
    artifacts,
  });

  await Deno.writeTextFile(`${distDir}/release-notes.md`, notes);
  console.log(`Wrote ${distDir}/release-notes.md`);
}

function releaseVersion(): string {
  const explicit = Deno.env.get("RELEASE_VERSION");
  if (explicit && explicit.trim().length > 0) return explicit.trim();
  const refName = Deno.env.get("GITHUB_REF_NAME");
  if (refName && refName.trim().length > 0) return refName.trim();
  return `dev-${Date.now()}`;
}

async function previousTagBefore(currentTag: string): Promise<string | null> {
  const out = await new Deno.Command("git", {
    args: ["tag", "--sort=-version:refname"],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return null;
  const tags = new TextDecoder().decode(out.stdout).split("\n").map((v) => v.trim()).filter(
    Boolean,
  );
  for (const tag of tags) {
    if (tag !== currentTag) return tag;
  }
  return null;
}

async function commitsSince(previousTag: string | null): Promise<CommitInfo[]> {
  const range = previousTag ? `${previousTag}..HEAD` : "HEAD";
  const out = await new Deno.Command("git", {
    args: ["log", "--pretty=format:%h%x09%s", range],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return [];

  const lines = new TextDecoder().decode(out.stdout).split("\n").filter(Boolean);
  return lines.map((line) => {
    const [sha, subjectRaw] = line.split("\t");
    const subject = subjectRaw ?? "";
    const match = subject.match(/^([a-z]+)(\([^)]+\))?(!)?:\s+/);
    return {
      sha,
      subject,
      type: match?.[1] ?? "other",
    };
  });
}

async function releaseArtifacts(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(distDir)) {
    if (!entry.isFile) continue;
    if (!entry.name.startsWith("zen-backup-") && !entry.name.startsWith("checksums-")) continue;
    names.push(entry.name);
  }
  names.sort();
  return names;
}

function renderCombinedReleaseNotes(input: {
  version: string;
  date: string;
  commit: string;
  previousTag: string | null;
  commits: CommitInfo[];
  artifacts: string[];
}): string {
  const section = (title: string, items: CommitInfo[]): string => {
    if (items.length === 0) return "";
    const lines = items.map((item) => `- ${stripTypePrefix(item.subject)} (\`${item.sha}\`)`);
    return `## ${title}\n\n${lines.join("\n")}\n`;
  };

  const features = input.commits.filter((c) => c.type === "feat");
  const fixes = input.commits.filter((c) => c.type === "fix");
  const docs = input.commits.filter((c) => c.type === "docs");
  const tests = input.commits.filter((c) => c.type === "test");
  const ci = input.commits.filter((c) => c.type === "ci");
  const other = input.commits.filter((c) =>
    !["feat", "fix", "docs", "test", "ci"].includes(c.type)
  );

  const artifacts = input.artifacts.map((name) => `- \`${basename(name)}\``).join("\n");
  const rangeLabel = input.previousTag
    ? `Changes since \`${input.previousTag}\``
    : "Changes in this release";

  return `# Zen Backup ${input.version}

Release date: ${input.date}
Commit: ${input.commit}

## Release Type

- Combined multi-platform beta release.

## Included Platforms

- macOS: launchd scheduling, install/uninstall, native notifications.
- Linux: systemd user timers, install/uninstall, notify-send integration with fallback logging.

## ${rangeLabel}

${section("Features", features)}${section("Fixes", fixes)}${section("Tests", tests)}${
    section("Docs", docs)
  }${section("CI", ci)}${section("Other Changes", other)}
## Artifacts

${artifacts || "- Artifacts attached by workflow."}

## Checksums

- SHA-256 checksum files are attached per platform.

## Planned Next

- Windows parity completion and full cross-platform stable release.
`;
}

function stripTypePrefix(subject: string): string {
  return subject.replace(/^([a-z]+)(\([^)]+\))?(!)?:\s+/, "");
}

async function gitCommitSha(): Promise<string> {
  const out = await new Deno.Command("git", {
    args: ["rev-parse", "--short", "HEAD"],
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!out.success) return "unknown";
  return new TextDecoder().decode(out.stdout).trim() || "unknown";
}
