import { join } from "jsr:@std/path@1.1.4";
import type { Platform } from "../types.ts";

export interface NotifyOptions {
  backupRoot: string;
  os: Platform;
  enabled: boolean;
  title: string;
  message: string;
}

export async function notify(options: NotifyOptions): Promise<void> {
  if (!options.enabled) return;
  await Deno.mkdir(options.backupRoot, { recursive: true });
  const path = join(options.backupRoot, "notifications.log");
  const line = `[${new Date().toISOString()}] ${options.os}: ${options.title} :: ${options.message}\n`;
  await Deno.writeTextFile(path, line, { append: true });
}
