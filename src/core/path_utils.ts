import { isAbsolute, join, resolve } from "jsr:@std/path@1.1.4";

export function resolveHomeDir(env: Record<string, string | undefined>): string {
  return env.HOME ?? env.USERPROFILE ?? ".";
}

export function expandPath(
  input: string,
  env: Record<string, string | undefined>,
  baseDir?: string,
): string {
  let value = input;

  if (value === "~") {
    value = resolveHomeDir(env);
  } else if (value.startsWith("~/")) {
    value = join(resolveHomeDir(env), value.slice(2));
  }

  value = value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, key: string) => env[key] ?? "");
  value = value.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, key: string) => env[key] ?? "");
  value = value.replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, key: string) => env[key] ?? "");

  if (baseDir && !isAbsolute(value)) {
    return resolve(baseDir, value);
  }

  return value;
}
