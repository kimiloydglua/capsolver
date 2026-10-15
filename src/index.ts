export { CapSolverClient, getClient, type CapSolverClientOptions, type SolveOptions } from "./core/client.js";
export * from "./core/errors.js";
export type * from "./core/types.js";
export * as solve from "./tasks/index.js";
export * as browser from "./browser/index.js";
export { defineModule, type CaptchaModule, type ModuleContext } from "./modules/types.js";
export { config } from "./config.js";
