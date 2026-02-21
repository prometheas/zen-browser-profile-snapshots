import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";
import {
  artifactPath,
  renderReleaseNotes,
  sha256File,
  writeChecksumsFile,
} from "../../src/release/artifacts.ts";

Deno.test("sha256File returns deterministic digest", async () => {
  const dir = await Deno.makeTempDir();
  const file = join(dir, "artifact.bin");
  await Deno.writeTextFile(file, "hello-release");

  const sum = await sha256File(file);
  assertEquals(sum.length, 64);
  assertEquals(sum, "e68d14ab276b1bc783a8316faab11e08dff764c9a109eda43210bcf75cd06393");
});

Deno.test("writeChecksumsFile renders checksum lines", async () => {
  const dir = await Deno.makeTempDir();
  const fileA = join(dir, "zen-backup-aarch64-apple-darwin");
  const fileB = join(dir, "zen-backup-x86_64-apple-darwin");
  await Deno.writeTextFile(fileA, "a");
  await Deno.writeTextFile(fileB, "b");

  const out = join(dir, "checksums.txt");
  await writeChecksumsFile(out, [
    { path: fileA, target: "aarch64-apple-darwin" },
    { path: fileB, target: "x86_64-apple-darwin" },
  ]);

  const text = await Deno.readTextFile(out);
  assertStringIncludes(text, "zen-backup-aarch64-apple-darwin");
  assertStringIncludes(text, "zen-backup-x86_64-apple-darwin");
});

Deno.test("renderReleaseNotes includes artifacts and metadata", () => {
  const notes = renderReleaseNotes(
    {
      version: "v1.2.3",
      date: "2026-02-20",
      commit: "abc1234",
    },
    [
      { path: "dist/zen-backup-aarch64-apple-darwin", target: "aarch64-apple-darwin" },
      { path: "dist/zen-backup-x86_64-apple-darwin", target: "x86_64-apple-darwin" },
    ],
  );

  assertStringIncludes(notes, "Zen Backup v1.2.3");
  assertStringIncludes(notes, "abc1234");
  assertStringIncludes(notes, "aarch64-apple-darwin");
  assertStringIncludes(notes, "x86_64-apple-darwin");
});

Deno.test("artifactPath creates standard file name", () => {
  assertEquals(
    artifactPath("dist", "aarch64-apple-darwin"),
    "dist/zen-backup-aarch64-apple-darwin",
  );
});
