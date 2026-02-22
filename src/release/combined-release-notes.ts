import { basename } from "jsr:@std/path@1.1.4";

export interface CommitInfo {
  sha: string;
  subject: string;
  type: string;
}

export interface PlatformMaturity {
  macos: string;
  linux: string;
  windows: string;
}

export interface CombinedReleaseNotesInput {
  version: string;
  date: string;
  commit: string;
  previousTag: string | null;
  commits: CommitInfo[];
  artifacts: string[];
  platformMaturity: PlatformMaturity;
}

export function defaultPlatformMaturity(): PlatformMaturity {
  return {
    macos: "beta",
    linux: "beta",
    windows: "alpha",
  };
}

export function renderCombinedReleaseNotes(input: CombinedReleaseNotesInput): string {
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

- Combined multi-platform prerelease.

## Platform Maturity

- macOS: ${input.platformMaturity.macos}
- Linux: ${input.platformMaturity.linux}
- Windows: ${input.platformMaturity.windows}

## Included Platforms

- macOS: launchd scheduling, install/uninstall, native notifications.
- Linux: systemd user timers, install/uninstall, notify-send integration with fallback logging.
- Windows: Task Scheduler integration, install/uninstall, PowerShell toast notification fallback.

## ${rangeLabel}

${section("Features", features)}${section("Fixes", fixes)}${section("Tests", tests)}${
    section("Docs", docs)
  }${section("CI", ci)}${section("Other Changes", other)}
## Artifacts

${artifacts || "- Artifacts attached by workflow."}

## Checksums

- SHA-256 checksum files are attached per platform.

## Planned Next

- Windows hardening from alpha to beta and full cross-platform stable release.
`;
}

export function stripTypePrefix(subject: string): string {
  return subject.replace(/^([a-z]+)(\([^)]+\))?(!)?:\s+/, "");
}
