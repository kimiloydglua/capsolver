import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

// Load .env from the project root, not the current directory, so launching from anywhere works.
dotenv.config({ path: fileURLToPath(new URL("../.env", import.meta.url)), quiet: true });

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number, got "${raw}"`);
  return n;
}

function str(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

export const config = {
  apiKey: str("CAPSOLVER_API_KEY"),
  appId: str("CAPSOLVER_APP_ID"),
  apiUrl: str("CAPSOLVER_API_URL") ?? "https://api.capsolver.com",
  fallbackApiUrl: "https://api-stable.capsolver.com",
  pollIntervalMs: num("CAPSOLVER_POLL_INTERVAL_MS", 2000),
  timeoutMs: num("CAPSOLVER_TIMEOUT_MS", 120_000),
  proxy: str("CAPSOLVER_PROXY"),
  headless: (process.env.HEADLESS ?? "true").toLowerCase() !== "false",
  chromeExecutablePath: str("CHROME_EXECUTABLE_PATH"),
} as const;

export function requireApiKey(): string {
  if (!config.apiKey) {
    throw new Error("CAPSOLVER_API_KEY is missing. Put it in .env (see .env.example).");
  }
  return config.apiKey;
}
