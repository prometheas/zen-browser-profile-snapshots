import { assertStringIncludes } from "jsr:@std/assert@1.0.19";
import {
  defaultPlatformMaturity,
  renderCombinedReleaseNotes,
} from "../../src/release/combined-release-notes.ts";

Deno.test("defaultPlatformMaturity marks windows as alpha", () => {
  const maturity = defaultPlatformMaturity();
  assertStringIncludes(JSON.stringify(maturity), '"windows":"alpha"');
});

Deno.test("renderCombinedReleaseNotes includes platform maturity section", () => {
  const notes = renderCombinedReleaseNotes({
    version: "v0.3.0-beta.5",
    date: "2026-02-22",
    commit: "abc1234",
    previousTag: "v0.3.0-beta.4",
    commits: [
      { sha: "deadbee", subject: "fix(windows): improve scheduler query", type: "fix" },
    ],
    artifacts: ["zen-backup-x86_64-pc-windows-msvc.exe"],
    platformMaturity: {
      macos: "beta",
      linux: "beta",
      windows: "alpha",
    },
  });

  assertStringIncludes(notes, "## Platform Maturity");
  assertStringIncludes(notes, "- macOS: beta");
  assertStringIncludes(notes, "- Linux: beta");
  assertStringIncludes(notes, "- Windows: alpha");
  assertStringIncludes(notes, "## Included Platforms");
  assertStringIncludes(notes, "Windows: Task Scheduler integration");
});
