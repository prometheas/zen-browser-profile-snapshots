import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1.0.19";
import { join } from "jsr:@std/path@1.1.4";

Deno.test("install script prints progress and sudo prompt guidance", async () => {
  const tempDir = await Deno.makeTempDir();
  const fakeBin = join(tempDir, "fake-bin");
  const installDir = join(tempDir, "install-target");
  const logPath = join(tempDir, "command.log");

  await Deno.mkdir(fakeBin, { recursive: true });
  await writeExecutable(
    join(fakeBin, "uname"),
    `#!/usr/bin/env sh
if [ "$1" = "-s" ]; then
  echo Linux
elif [ "$1" = "-m" ]; then
  echo x86_64
else
  command uname "$@"
fi
`,
  );
  await writeExecutable(
    join(fakeBin, "curl"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "curl $*" >> "$log_file"
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
cat > "$out" <<'EOF'
#!/usr/bin/env sh
echo "fake status"
EOF
chmod +x "$out"
`,
  );
  await writeExecutable(
    join(fakeBin, "sudo"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "sudo $*" >> "$log_file"
export UNDER_SUDO=1
exec "$@"
`,
  );
  await writeExecutable(
    join(fakeBin, "mkdir"),
    `#!/usr/bin/env sh
if [ "\${UNDER_SUDO:-0}" = "1" ]; then
  exec /bin/mkdir "$@"
fi
exit 1
`,
  );
  await writeExecutable(
    join(fakeBin, "install"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "install $*" >> "$log_file"
src="$3"
dst="$4"
mkdir -p "$(dirname "$dst")"
cp "$src" "$dst"
chmod 0755 "$dst"
`,
  );

  const command = new Deno.Command("sh", {
    args: ["scripts/install-from-release.sh"],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
    env: {
      PATH: `${fakeBin}:${Deno.env.get("PATH") ?? ""}`,
      ZEN_BACKUP_INSTALL_DIR: installDir,
      ZEN_BACKUP_ASSUME_YES: "1",
      INSTALL_SCRIPT_LOG: logPath,
    },
  });
  const output = await command.output();
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);

  assertEquals(output.success, true);
  assertStringIncludes(stderr, "Downloading");
  assertStringIncludes(stderr, "Elevated privileges are required");
  assertStringIncludes(stdout, "installed zen-backup");
  assertStringIncludes(stdout, "fake status");

  const log = await Deno.readTextFile(logPath);
  assertStringIncludes(log, "curl ");
  assertStringIncludes(log, "sudo install -m 0755");
});

Deno.test("install script exits with guidance when sudo is required in non-interactive mode", async () => {
  const tempDir = await Deno.makeTempDir();
  const fakeBin = join(tempDir, "fake-bin");
  const installDir = join(tempDir, "install-target");
  const logPath = join(tempDir, "command.log");

  await Deno.mkdir(fakeBin, { recursive: true });
  await writeExecutable(
    join(fakeBin, "uname"),
    `#!/usr/bin/env sh
if [ "$1" = "-s" ]; then
  echo Linux
elif [ "$1" = "-m" ]; then
  echo x86_64
else
  command uname "$@"
fi
`,
  );
  await writeExecutable(
    join(fakeBin, "curl"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "curl $*" >> "$log_file"
out=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then
    out="$2"
    shift 2
    continue
  fi
  shift
done
cat > "$out" <<'EOF'
#!/usr/bin/env sh
echo "fake status"
EOF
chmod +x "$out"
`,
  );
  await writeExecutable(
    join(fakeBin, "sudo"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "sudo $*" >> "$log_file"
export UNDER_SUDO=1
exec "$@"
`,
  );
  await writeExecutable(
    join(fakeBin, "mkdir"),
    `#!/usr/bin/env sh
if [ "\${UNDER_SUDO:-0}" = "1" ]; then
  exec /bin/mkdir "$@"
fi
exit 1
`,
  );
  await writeExecutable(
    join(fakeBin, "install"),
    `#!/usr/bin/env sh
log_file="\${INSTALL_SCRIPT_LOG:?}"
echo "install $*" >> "$log_file"
src="$3"
dst="$4"
mkdir -p "$(dirname "$dst")"
cp "$src" "$dst"
chmod 0755 "$dst"
`,
  );

  const command = new Deno.Command("sh", {
    args: ["scripts/install-from-release.sh"],
    cwd: Deno.cwd(),
    stdout: "piped",
    stderr: "piped",
    env: {
      PATH: `${fakeBin}:${Deno.env.get("PATH") ?? ""}`,
      ZEN_BACKUP_INSTALL_DIR: installDir,
      INSTALL_SCRIPT_LOG: logPath,
    },
  });
  const output = await command.output();
  const stderr = new TextDecoder().decode(output.stderr);

  assertEquals(output.success, false);
  assertStringIncludes(stderr, "requires elevated privileges");
  assertEquals(
    stderr.includes("non-interactive") || stderr.includes("installation cancelled"),
    true,
  );
});

async function writeExecutable(path: string, content: string): Promise<void> {
  await Deno.writeTextFile(path, content);
  await Deno.chmod(path, 0o755);
}
