// worldofnations.fr side: login, cooldowns, and the "vote check" the site runs after you click a vote button.
// The site is Azuriom + its vote plugin (see /assets/plugins/vote/js/vote.js):
//   GET  /vote/user/{name}         -> { sites: { [id]: nextVoteTimestampMs | null } }   (read-only)
//   POST /vote/site/{id}/done      -> { status: "pending" } until the vote site reports our IP voted,
//                                     then { message } (reward given) or { status: "select_server" }.
import type { HTTPResponse, Page } from "puppeteer";
import { autoSolve, detectCaptchas } from "../../browser/index.js";

export const WON_URL = "https://worldofnations.fr";

export async function getCooldowns(username: string): Promise<Record<string, number | null>> {
  const res = await fetch(`${WON_URL}/vote/user/${encodeURIComponent(username)}`, {
    headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
  });
  if (!res.ok) throw new Error(`WON cooldowns: HTTP ${res.status}`);
  const data = (await res.json()) as { sites?: Record<string, number | null> };
  return data.sites ?? {};
}

const isLoggedIn = (page: Page) => page.evaluate(() => !document.querySelector('a[href$="/user/login"]'));

export async function login(page: Page, email: string, password: string, log: (...m: unknown[]) => void): Promise<void> {
  await page.goto(`${WON_URL}/vote`, { waitUntil: "networkidle2", timeout: 60_000 });
  if (await isLoggedIn(page)) {
    log("already logged in (saved session)");
    return;
  }
  await page.goto(`${WON_URL}/user/login`, { waitUntil: "networkidle2", timeout: 60_000 });
  await page.type("#email", email);
  await page.type("#password", password);
  await page.$eval("#remember", (el) => ((el as HTMLInputElement).checked = true)).catch(() => {});

  // Azuriom can enable a captcha on login; handle it if it ever appears.
  if ((await detectCaptchas(page)).length > 0) {
    log("login captcha present, solving");
    await autoSolve(page);
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }),
    page.click('#captcha-form button[type="submit"]'),
  ]);
  if (!(await isLoggedIn(page))) {
    const err = await page.evaluate(() => document.querySelector(".invalid-feedback, .alert-danger")?.textContent?.trim());
    throw new Error(`WON login failed${err ? `: ${err}` : ""}`);
  }
  log("logged in");
}

/** Open /vote and make sure the site-button step is visible (fills the name step if shown). */
export async function openVotePage(page: Page, username: string): Promise<void> {
  await page.goto(`${WON_URL}/vote`, { waitUntil: "networkidle2", timeout: 60_000 });
  const needsName = await page.evaluate(() => {
    const step1 = document.querySelector('[data-vote-step="1"]');
    return !!step1 && !step1.classList.contains("d-none");
  });
  if (needsName) {
    await page.type("#stepNameInput", username);
    await page.click('#voteNameForm button[type="submit"]');
  }
  await page.waitForSelector('[data-vote-step="2"]:not(.d-none)', { timeout: 30_000 });
}

export interface CheckResult {
  ok: boolean;
  message: string;
}

/**
 * Do what clicking a vote button does on worldofnations.fr: start polling /vote/site/{id}/done.
 * Uses a middle-click event so the site's JS starts the check without opening a new tab.
 * Returns a promise resolving when the site says the vote was rewarded (or errors / times out).
 */
export function startVoteCheck(page: Page, siteId: string, timeoutMs = 2 * 60_000): { result: Promise<CheckResult>; started: Promise<void> } {
  let cleanup = () => {};
  const result = new Promise<CheckResult>((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve({ ok: false, message: `WON did not detect the vote within ${timeoutMs / 1000}s` });
    }, timeoutMs);

    const onResponse = async (res: HTTPResponse) => {
      if (!res.url().endsWith(`/vote/site/${siteId}/done`) || res.request().method() !== "POST") return;
      let data: { status?: string; message?: string; servers?: Record<string, string> } = {};
      try {
        data = await res.json();
      } catch {
        /* non-JSON error page */
      }
      if (res.ok() && data.status === "pending") return; // site JS polls again in 5s
      if (res.ok() && data.status === "select_server") {
        // Reward needs a target server: pick the first, like a user clicking the first button.
        await page.click("#server-select button").catch(() => {});
        return;
      }
      clearTimeout(timer);
      cleanup();
      resolve({ ok: res.ok(), message: data.message ?? `HTTP ${res.status()}` });
    };
    page.on("response", onResponse);
    cleanup = () => page.off("response", onResponse);
  });

  const started = page
    .$eval(`[data-vote-id="${siteId}"]`, (el) => {
      if (el.classList.contains("disabled")) throw new Error("vote button is disabled (cooldown on WON side)");
      el.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    })
    .catch((e: Error) => {
      cleanup();
      throw e;
    });

  return { result, started };
}
