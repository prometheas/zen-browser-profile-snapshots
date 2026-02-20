import { setWorldConstructor, World } from "npm:@cucumber/cucumber@12.6.0";
import { resolve } from "jsr:@std/path@1.1.4";

export class ZenWorld extends World {
  cwd = "";
  env: Record<string, string | undefined> = {};
  stdout = "";
  stderr = "";
  exitCode = -1;
  loadedConfig: unknown = null;

  async initWorkspace(): Promise<void> {
    this.cwd = await Deno.makeTempDir();
    this.env = {
      HOME: this.cwd,
    };
  }

  resolvePath(path: string): string {
    return resolve(this.cwd, path);
  }
}

setWorldConstructor(ZenWorld);
