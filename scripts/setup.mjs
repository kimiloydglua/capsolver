// One-time setup, works on Windows/macOS/Linux: installs dependencies and fills in .env.
// Plain JS (no tsx) so it can run before `npm install`.
//   node scripts/setup.mjs
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env");

const major = Number(process.versions.node.split(".")[0]);
if (major < 20) {
  console.error(`Node.js 20 or newer is required (you have ${process.version}). Get it from https://nodejs.org`);
  process.exit(1);
}

if (!existsSync(join(root, "node_modules"))) {
  console.log("Installing dependencies (first run only, also downloads Chrome)...");
  // npm is npm.cmd on Windows, which needs a shell to run.
  const r = spawnSync("npm", ["install"], { cwd: root, stdio: "inherit", shell: process.platform === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(envPath)) copyFileSync(join(root, ".env.example"), envPath);
let env = readFileSync(envPath, "utf8");

const get = (key) => new RegExp(`^${key}=(.*)$`, "m").exec(env)?.[1]?.trim() ?? "";
const set = (key, value) => {
  const line = `${key}=${value}`;
  env = new RegExp(`^${key}=.*$`, "m").test(env) ? env.replace(new RegExp(`^${key}=.*$`, "m"), line) : `${env.trimEnd()}\n${line}\n`;
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
const lines = rl[Symbol.asyncIterator]();
const prompt = async (question) => {
  process.stdout.write(question);
  const { value, done } = await lines.next();
  if (done) throw new Error("Input closed before setup finished.");
  return value;
};
const ask = async (key, question, required = false) => {
  if (get(key)) return;
  for (;;) {
    const answer = (await prompt(question)).trim();
    if (answer || !required) {
      if (answer) set(key, answer);
      return;
    }
  }
};

await ask("CAPSOLVER_API_KEY", "CapSolver API key (from https://dashboard.capsolver.com): ", true);
if (!get("WON_EMAIL")) {
  const won = (await prompt("Set up the World of Nations voter too? (y/N): ")).trim().toLowerCase();
  if (won === "y" || won === "yes") {
    await ask("WON_EMAIL", "  WON email: ", true);
    await ask("WON_PASSWORD", "  WON password: ", true);
    await ask("WON_USERNAME", "  WON username (in-game name): ", true);
  }
}
rl.close();

writeFileSync(envPath, env);
console.log(`\nSetup done. Settings are in ${envPath} (edit it any time).`);
