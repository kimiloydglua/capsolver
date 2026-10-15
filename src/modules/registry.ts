import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CaptchaModule } from "./types.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Every folder in src/modules/ with an index.ts (or .js once built), except ones starting with "_". */
export async function loadModules(): Promise<Map<string, CaptchaModule>> {
  const out = new Map<string, CaptchaModule>();
  const entries = await readdir(here, { withFileTypes: true });
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith("_")) continue;
    const dir = join(here, e.name);
    const files = await readdir(dir);
    const entry = files.find((f) => f === "index.ts" || f === "index.js");
    if (!entry) continue;
    const mod = (await import(pathToFileURL(join(dir, entry)).href)).default as CaptchaModule | undefined;
    if (!mod?.run) throw new Error(`Module "${e.name}" must default-export defineModule({...})`);
    out.set(mod.name, mod);
  }
  return out;
}
