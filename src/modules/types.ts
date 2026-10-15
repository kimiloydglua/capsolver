import type { CapSolverClient } from "../core/client.js";

export interface ModuleContext {
  client: CapSolverClient;
  /** Raw CLI args after the module name. */
  args: string[];
  /** --key=value / --flag parsed from args. */
  flags: Record<string, string | boolean>;
  log: (...msg: unknown[]) => void;
}

export interface CaptchaModule {
  name: string;
  description: string;
  run(ctx: ModuleContext): Promise<unknown>;
}

/** Identity helper so modules get type checking without importing the interface by hand. */
export const defineModule = (m: CaptchaModule): CaptchaModule => m;
