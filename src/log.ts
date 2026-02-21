import { join } from "jsr:@std/path@1.1.4";

export type LogLevel = "SUCCESS" | "WARNING" | "ERROR" | "RESTORE";

export async function appendLog(
  backupRoot: string,
  level: LogLevel,
  message: string,
): Promise<void> {
  await Deno.mkdir(backupRoot, { recursive: true });
  const logPath = join(backupRoot, "backup.log");
  const line = `[${new Date().toISOString()}] ${level}: ${message}\n`;
  await Deno.writeTextFile(logPath, line, { append: true });
}
