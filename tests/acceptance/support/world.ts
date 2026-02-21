import { setWorldConstructor, World } from "npm:@cucumber/cucumber@12.6.0";
import { resolve } from "jsr:@std/path@1.1.4";
import { buildScenarioEnv } from "./world-env.ts";

export class ZenWorld extends World {
  cwd = "";
  env: Record<string, string | undefined> = {};
  stdout = "";
  stderr = "";
  exitCode = -1;
  loadedConfig: unknown = null;
  profileDir = "";
  backupDir = "";
  lastArchivePath = "";
  missingProfilePath = "";
  extractedDir = "";
  cloudPath: string | undefined = undefined;
  sqliteLockProcess: Deno.ChildProcess | null = null;
  sqliteLockWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
  now: Date | undefined = undefined;
  retentionDaily: number | undefined = undefined;
  retentionWeekly: number | undefined = undefined;
  restoreArchiveName = "";
  restoreArchivePath = "";
  restoreEntries: Record<string, string> = {};
  preRestorePath = "";
  profileBeforeRestore: Record<string, string> = {};
  absoluteArchiveSourcePath = "";

  async initWorkspace(): Promise<void> {
    this.cwd = await Deno.makeTempDir();
    this.env = buildScenarioEnv(this.env, this.cwd);
    this.now = undefined;
    this.retentionDaily = undefined;
    this.retentionWeekly = undefined;
    this.restoreArchiveName = "";
    this.restoreArchivePath = "";
    this.restoreEntries = {};
    this.preRestorePath = "";
    this.profileBeforeRestore = {};
    this.absoluteArchiveSourcePath = "";
  }

  resolvePath(path: string): string {
    return resolve(this.cwd, path);
  }

  envWithHome(): Record<string, string | undefined> {
    return {
      HOME: this.cwd,
      ...this.env,
    };
  }
}

setWorldConstructor(ZenWorld);
