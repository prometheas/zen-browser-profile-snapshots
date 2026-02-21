const embeddedVersionFile = "src/generated/version.ts";

export async function withEmbeddedVersion<T>(version: string, fn: () => Promise<T>): Promise<T> {
  const previous = await readCurrentModule();
  await Deno.writeTextFile(embeddedVersionFile, renderEmbeddedVersionModule(version));
  try {
    return await fn();
  } finally {
    if (previous === null) {
      await Deno.remove(embeddedVersionFile).catch(() => undefined);
    } else {
      await Deno.writeTextFile(embeddedVersionFile, previous);
    }
  }
}

export function renderEmbeddedVersionModule(version: string): string {
  return `export const EMBEDDED_VERSION = ${JSON.stringify(version)};\n`;
}

async function readCurrentModule(): Promise<string | null> {
  try {
    return await Deno.readTextFile(embeddedVersionFile);
  } catch {
    return null;
  }
}
