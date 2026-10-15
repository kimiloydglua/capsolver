// World of Nations auto-voter.
//
//   npm run cs -- run worldofnations --dry-run          test everything except the final vote click (all sites)
//   npm run cs -- run worldofnations                    vote once on every site that is off cooldown
//   npm run cs -- run worldofnations --loop             keep running, vote each site as soon as it's available
//   options: --sites=1,2,3,5   --headful
//
// Flow per site (same as a human): on worldofnations.fr/vote click the site's button (starts WON's vote check),
// vote on the site in another tab, then wait until WON reports the reward. WON matches the vote by IP,
// so everything runs from this machine's connection.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Browser } from "puppeteer";
import { launchBrowser, newPage } from "../../browser/index.js";
import { defineModule } from "../types.js";
import { SITES, type VoteSite } from "./sites.js";
import { getCooldowns, login, openVotePage, startVoteCheck } from "./won.js";

const PROFILE_DIR = fileURLToPath(new URL("../../../.data/won-profile", import.meta.url));
const RETRY_AFTER_FAILURE_MS = 10 * 60_000;
const SAFETY_MARGIN_MS = 60_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms: number) => `${Math.floor(ms / 3_600_000)}h${String(Math.floor((ms % 3_600_000) / 60_000)).padStart(2, "0")}m`;

function env(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`${name} missing in .env`);
  return v;
}

export default defineModule({
  name: "worldofnations",
  description: "Vote for World of Nations on all vote sites (--dry-run, --loop, --sites=1,2,3,5, --headful)",
  async run({ flags, log: rawLog }) {
    const log = (...m: unknown[]) => rawLog(new Date().toLocaleTimeString("fr-FR"), ...m);
    const email = env("WON_EMAIL");
    const password = env("WON_PASSWORD");
    const username = env("WON_USERNAME");
    const dryRun = flags["dry-run"] === true;
    const loop = flags.loop === true && !dryRun;
    const wanted = typeof flags.sites === "string" ? new Set(flags.sites.split(",")) : null;
    const sites = SITES.filter((s) => !wanted || wanted.has(s.id));
    const retryAt = new Map<string, number>(); // backoff after failures, per site id
    const summary: Record<string, string> = {};

    if (dryRun) log("DRY RUN: captchas get solved (costs CapSolver credit), nothing is submitted");

    for (;;) {
      const cooldowns = await getCooldowns(username);
      const now = Date.now();
      const due = dryRun
        ? sites
        : sites.filter((s) => (cooldowns[s.id] ?? 0) <= now && (retryAt.get(s.id) ?? 0) <= now);

      for (const s of sites) {
        const until = cooldowns[s.id];
        if (until && until > now) log(`${s.name}: next vote in ${fmt(until - now)}`);
      }

      if (due.length > 0) {
        log(`voting on: ${due.map((s) => s.name).join(", ")}`);
        const browser = await launchBrowser({
          userDataDir: PROFILE_DIR,
          ...(flags.headful === true ? { headless: false } : {}),
        });
        try {
          await voteRound(browser, due, { email, password, username, dryRun, log, retryAt, summary });
        } finally {
          await browser.close();
        }
      }

      if (!loop) return summary;

      // Sleep until the next site becomes available (per WON), or a failed site's retry time.
      const fresh = await getCooldowns(username).catch(() => cooldowns);
      const wake = sites
        .map((s) => Math.max(fresh[s.id] ?? 0, retryAt.get(s.id) ?? 0))
        .map((t) => Math.max(t, Date.now()))
        .reduce((a, b) => Math.min(a, b), Infinity);
      const wait = Math.max(wake - Date.now(), 0) + SAFETY_MARGIN_MS;
      log(`sleeping ${fmt(wait)} (until ${new Date(Date.now() + wait).toLocaleTimeString("fr-FR")})`);
      await sleep(wait);
    }
  },
});

interface RoundCtx {
  email: string;
  password: string;
  username: string;
  dryRun: boolean;
  log: (...m: unknown[]) => void;
  retryAt: Map<string, number>;
  summary: Record<string, string>;
}

async function voteRound(browser: Browser, due: VoteSite[], c: RoundCtx) {
  const won = await newPage(browser);
  await login(won, c.email, c.password, c.log);
  await openVotePage(won, c.username);
  const sitePage = await newPage(browser);

  // One site at a time: WON shows a spinner and checks one vote at a time.
  for (const site of due) {
    try {
      let check: ReturnType<typeof startVoteCheck> | undefined;
      if (!c.dryRun) {
        await openVotePage(won, c.username); // fresh page = fresh button state / listeners
        check = startVoteCheck(won, site.id);
        await check.started;
      }

      const outcome = await site.vote(sitePage, { username: c.username, dryRun: c.dryRun, log: c.log });
      c.log(`[${site.name}] ${outcome.message}`);

      if (c.dryRun || !check) {
        c.summary[site.name] = outcome.message;
        continue;
      }

      c.log(`[${site.name}] waiting for worldofnations.fr to detect the vote...`);
      const result = await check.result;
      c.log(`[${site.name}] WON: ${result.ok ? "OK" : "FAILED"} - ${result.message}`);
      c.summary[site.name] = `${outcome.alreadyVoted ? "already voted on site; " : ""}WON ${result.ok ? "rewarded" : "not rewarded"}: ${result.message}`;
      if (!result.ok) c.retryAt.set(site.id, Date.now() + RETRY_AFTER_FAILURE_MS);
    } catch (err) {
      c.log(`[${site.name}] ERROR ${(err as Error).message}`);
      c.summary[site.name] = `error: ${(err as Error).message}`;
      c.retryAt.set(site.id, Date.now() + RETRY_AFTER_FAILURE_MS);
      await sitePage.screenshot({ path: join(PROFILE_DIR, "..", `error-${site.id}.png`) }).catch(() => {});
    }
  }
}
