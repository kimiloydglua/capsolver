// One voter per vote site. Each fills the name, solves the captcha through CapSolver, injects it,
// and (unless dryRun) submits. Dry run stops right before the submit click, so no vote is spent.
import type { HTTPResponse, Page } from "puppeteer";
import { detectCaptchas, injectMtCaptchaToken, injectRecaptchaToken, injectTurnstileToken } from "../../browser/index.js";
import { mtcaptcha, recaptchaV2, turnstile } from "../../tasks/index.js";

export interface VoteContext {
  username: string;
  dryRun: boolean;
  log: (...m: unknown[]) => void;
}

export interface SiteOutcome {
  /** True once the vote form was submitted (real run only). */
  submitted: boolean;
  /** The site says we already voted / are on cooldown. */
  alreadyVoted: boolean;
  message: string;
}

export interface VoteSite {
  /** data-vote-id on worldofnations.fr */
  id: string;
  name: string;
  url: string;
  vote(page: Page, ctx: VoteContext): Promise<SiteOutcome>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

async function goto(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
}

/** Replace an input's value. Sites prefill the pseudo from the saved profile, and page.type() would append to it. */
async function fill(page: Page, selector: string, value: string) {
  await page.$eval(selector, (e) => ((e as HTMLInputElement).value = ""));
  await page.type(selector, value);
}

async function sitekeyOf(page: Page, kind: "recaptcha" | "turnstile" | "mtcaptcha", fallback: string): Promise<string> {
  const found = (await detectCaptchas(page)).find((c) => c.kind === kind);
  return found && "sitekey" in found ? found.sitekey : fallback;
}

/** Text of visible alert/flash messages, used to report what the site answered. */
async function alertsText(page: Page): Promise<string> {
  return page.evaluate(() =>
    [...document.querySelectorAll(".alert, .ajax-msg, [role=alert], .flash, .toast, .notification, .message-blured")]
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => (e as HTMLElement).innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join(" | "),
  );
}

const ALREADY_RE = /déjà voté|deja vote|already voted|revenez dans|attendre|prochain vote|pouvez voter dans|patienter/i;

// ---------------------------------------------------------------------------

const serveurPrive: VoteSite = {
  id: "1",
  name: "serveur-prive.net",
  url: "https://serveur-prive.net/minecraft/world-of-nations-8682/vote",
  async vote(page, { username, dryRun, log }) {
    await goto(page, this.url);
    const cooldown = await page.$eval("#voteForm .message-blured", (e) => (e as HTMLElement).innerText).catch(() => null);
    if (cooldown) return { submitted: false, alreadyVoted: true, message: clean(cooldown) };

    await fill(page, "#username", username);
    const websiteKey = await sitekeyOf(page, "mtcaptcha", "MTPublic-42pXmytZe");
    log(`[${this.name}] solving MTCaptcha`);
    const { solution } = await mtcaptcha({ websiteURL: page.url(), websiteKey, retries: 4 }); // MTCaptcha fails often on CapSolver's side
    await injectMtCaptchaToken(page, solution.token);

    const filled = await page.$eval("#mtcaptcha-verifiedtoken-1", (e) => (e as HTMLInputElement).value.length > 0).catch(() => false);
    if (!filled) throw new Error("MTCaptcha token input not found/filled");
    if (dryRun) return { submitted: false, alreadyVoted: false, message: "dry run: name + MTCaptcha token filled, not submitted" };

    if (await page.$eval("#voteBtn", (b) => (b as HTMLButtonElement).disabled)) {
      throw new Error(`vote button disabled: ${(await alertsText(page)) || "no message shown"}`);
    }
    const resP = page.waitForResponse((r) => r.url().includes("/vote/form/ajax") && r.request().method() === "POST", { timeout: 60_000 });
    // Submit the form directly: a mouse click can land on an ad/popup covering the button, and then nothing is sent.
    await page.$eval("#voteForm", (f) => (f as HTMLFormElement).requestSubmit(f.querySelector<HTMLButtonElement>("#voteBtn")));
    const res = await resP.catch(async () => {
      throw new Error(`no answer from serveur-prive.net after submitting: ${(await alertsText(page)) || "no message shown"}`);
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; data?: unknown };
    const message = clean(Array.isArray(data.data) ? data.data.join(" ") : String(data.data ?? `HTTP ${res.status()}`)).replace(/<[^>]+>/g, "");
    if (data.success !== true && !ALREADY_RE.test(message)) throw new Error(`vote rejected: ${message}`);
    return { submitted: data.success === true, alreadyVoted: data.success !== true, message };
  },
};

const serveurMinecraftVote: VoteSite = {
  id: "2",
  name: "serveur-minecraft-vote.fr",
  url: "https://serveur-minecraft-vote.fr/serveur/213/voter",
  async vote(page, { username, dryRun, log }) {
    await goto(page, this.url);
    await page.waitForSelector("form.srvp-vote-form #vote-pseudo", { timeout: 30_000 });
    await fill(page, "#vote-pseudo", username);

    // Turnstile is rendered by React; give it a moment so our hook captures its callback.
    await page.waitForFunction(() => ((window as any).__csTurnstile ?? []).length > 0, { timeout: 15_000 }).catch(() => {});
    const websiteKey = await sitekeyOf(page, "turnstile", "0x4AAAAAADiIpzB3XMqmZSYh");
    log(`[${this.name}] solving Turnstile`);
    const { solution } = await turnstile({ websiteURL: page.url(), websiteKey });
    await injectTurnstileToken(page, solution.token);

    const submitSel = "form.srvp-vote-form button[type=submit]";
    const enabled = await page.$eval(submitSel, (b) => !(b as HTMLButtonElement).disabled).catch(() => false);
    if (!enabled) throw new Error("vote button still disabled after Turnstile token");
    if (dryRun) return { submitted: false, alreadyVoted: false, message: "dry run: pseudo + Turnstile token set, vote button enabled, not submitted" };

    const posts: string[] = [];
    const onRes = async (r: HTTPResponse) => {
      if (r.request().method() !== "POST" || !r.url().includes("serveur-minecraft-vote.fr")) return;
      posts.push(`${r.status()} ${clean(await r.text().catch(() => "")).slice(0, 300)}`);
    };
    page.on("response", onRes);
    await Promise.all([page.waitForNavigation({ timeout: 20_000 }).catch(() => {}), page.click(submitSel)]);
    await sleep(4000);
    page.off("response", onRes);

    const message = clean([await alertsText(page), ...posts].filter(Boolean).join(" | ")) || "submitted (no message shown)";
    const alreadyVoted = ALREADY_RE.test(message);
    return { submitted: !alreadyVoted, alreadyVoted, message };
  },
};

const serveurMinecraftCom: VoteSite = {
  id: "3",
  name: "serveur-minecraft.com",
  url: "https://serveur-minecraft.com/5665",
  async vote(page, { username, dryRun, log }) {
    await goto(page, this.url);
    await fill(page, "#form_username", username);
    const websiteKey = await sitekeyOf(page, "recaptcha", "6LcQmooUAAAAAEuP2PMGi8ZN7OT373Qic8jwgaOX");
    log(`[${this.name}] solving reCAPTCHA v2`);
    const { solution } = await recaptchaV2({ websiteURL: page.url(), websiteKey });
    await injectRecaptchaToken(page, solution.gRecaptchaResponse);
    if (dryRun) return { submitted: false, alreadyVoted: false, message: "dry run: name + reCAPTCHA token filled, not submitted" };

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }),
      page.click('form[name="form"] button[type="submit"]'),
    ]);
    const message = (await alertsText(page)) || "submitted (no message shown)";
    const alreadyVoted = ALREADY_RE.test(message);
    return { submitted: !alreadyVoted, alreadyVoted, message };
  },
};

const serveursMinecraftOrg: VoteSite = {
  id: "5",
  name: "serveursminecraft.org",
  url: "https://www.serveursminecraft.org/serveur/6551/",
  async vote(page, { dryRun, log }) {
    await goto(page, this.url);
    // "Voter pour World of Nations" opens the confirmation modal holding the reCAPTCHA. No name on this site.
    await page.click('a[data-target="#vote"]');
    await page.waitForSelector("#vote.in, #vote.show", { timeout: 15_000 }).catch(() => {});
    const websiteKey = await sitekeyOf(page, "recaptcha", "6LegdhkUAAAAAJG95xpN69eylHs3bT4wRikdDQzH");
    log(`[${this.name}] solving reCAPTCHA v2`);
    const { solution } = await recaptchaV2({ websiteURL: page.url(), websiteKey });
    await injectRecaptchaToken(page, solution.gRecaptchaResponse);
    if (dryRun) return { submitted: false, alreadyVoted: false, message: "dry run: vote modal open + reCAPTCHA token filled, not submitted" };

    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60_000 }),
      page.click('#vote input[type="submit"]'),
    ]);
    const message = (await alertsText(page)) || clean(await page.evaluate(() => document.body.innerText)).slice(0, 200);
    const alreadyVoted = ALREADY_RE.test(message);
    return { submitted: !alreadyVoted, alreadyVoted, message };
  },
};

export const SITES: VoteSite[] = [serveurPrive, serveurMinecraftVote, serveurMinecraftCom, serveursMinecraftOrg];
