import { getClient } from "./core/client.js";
import { CapSolverError } from "./core/errors.js";
import { loadModules } from "./modules/registry.js";

function parseFlags(args: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (const a of args) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]!] = m[2] ?? true;
  }
  return flags;
}

const HELP = `Usage:
  npm run cs -- balance                 Show account balance and packages
  npm run cs -- list                    List use-case modules
  npm run cs -- run <module> [--flags]  Run a module`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "balance": {
      const { balance, packages } = await getClient().getBalance();
      console.log(`Balance: $${balance}`);
      if (packages?.length) console.table(packages);
      return;
    }
    case "list": {
      const mods = await loadModules();
      for (const m of mods.values()) console.log(`${m.name.padEnd(24)} ${m.description}`);
      return;
    }
    case "run": {
      const [name, ...args] = rest;
      const mods = await loadModules();
      const mod = name ? mods.get(name) : undefined;
      if (!mod) {
        console.error(`Unknown module "${name ?? ""}". Available: ${[...mods.keys()].join(", ")}`);
        process.exitCode = 1;
        return;
      }
      const result = await mod.run({
        client: getClient(),
        args,
        flags: parseFlags(args),
        log: (...m) => console.error(`[${mod.name}]`, ...m),
      });
      if (result !== undefined) console.log(JSON.stringify(result, null, 2));
      return;
    }
    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  if (err instanceof CapSolverError) console.error(`CapSolver error: ${err.message}`);
  else console.error(err);
  process.exitCode = 1;
});
