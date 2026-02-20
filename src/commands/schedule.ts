import { queryScheduler, startScheduler, stopScheduler } from "../platform/scheduler.ts";
import type { RuntimeOptions } from "../types.ts";

export async function runSchedule(
  action: "start" | "resume" | "stop" | "pause" | "status",
  options: RuntimeOptions = {},
): Promise<{ exitCode: number; stdout: string[]; stderr: string[] }> {
  const stdout: string[] = [];
  const stderr: string[] = [];

  try {
    const normalized = action === "resume" ? "start" : action === "pause" ? "stop" : action;
    const scheduler = normalized === "start"
      ? await startScheduler(options)
      : normalized === "stop"
      ? await stopScheduler(options)
      : await queryScheduler(options);

    if (normalized === "start") stdout.push("Scheduled backups started.");
    if (normalized === "stop") stdout.push("Scheduled backups stopped.");

    if (scheduler.labels.length === 0) {
      stdout.push("No scheduled jobs.");
    } else {
      for (const label of scheduler.labels) {
        const state = scheduler.states[label] ?? "not_installed";
        stdout.push(`${label}: ${state}`);
      }
    }

    return { exitCode: 0, stdout, stderr };
  } catch (error) {
    stderr.push(error instanceof Error ? error.message : String(error));
    return { exitCode: 1, stdout, stderr };
  }
}
