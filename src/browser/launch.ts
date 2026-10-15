import puppeteer, { type Browser, type LaunchOptions, type Page } from "puppeteer";
import { config } from "../config.js";

export interface BrowserOptions extends LaunchOptions {
  /** Upstream proxy, e.g. "http://ip:port" (auth via `proxyAuth`). */
  proxyServer?: string;
  proxyAuth?: { username: string; password: string };
  userAgent?: string;
}

export async function launchBrowser(opts: BrowserOptions = {}): Promise<Browser> {
  const { proxyServer, proxyAuth, userAgent, args = [], ...rest } = opts;
  return puppeteer.launch({
    headless: config.headless,
    executablePath: config.chromeExecutablePath,
    args: [
      "--no-sandbox",
      "--disable-blink-features=AutomationControlled",
      ...(proxyServer ? [`--proxy-server=${proxyServer}`] : []),
      ...args,
    ],
    defaultViewport: { width: 1366, height: 768 },
    ...rest,
  });
}

// tsx/esbuild wraps named inner functions with __name(); functions passed to page.evaluate
// then fail in the browser with "__name is not defined". Define a no-op there.
const NAME_SHIM = "globalThis.__name ??= (f) => f";

// Wrap window.turnstile.render so we can read sitekey/action/cData and fire the site's callback
// with a CapSolver token (needed for React/Vue forms that only unlock on the callback).
const TURNSTILE_HOOK = `(() => {
  if (window.__csTurnstile) return;
  window.__csTurnstile = [];
  // Poll instead of defineProperty: Turnstile refuses to init if window.turnstile already exists.
  const started = Date.now();
  const tick = () => {
    const ts = window.turnstile;
    if (ts && typeof ts.render === "function" && !ts.__csWrapped) {
      const orig = ts.render.bind(ts);
      ts.render = (el, params) => { window.__csTurnstile.push(params || {}); return orig(el, params); };
      ts.__csWrapped = true;
    }
    if (Date.now() - started < 120000) setTimeout(tick, 15);
  };
  tick();
})()`;

export async function ensureShim(page: Page): Promise<void> {
  await page.evaluate(NAME_SHIM);
}

export async function newPage(browser: Browser, opts: Pick<BrowserOptions, "proxyAuth" | "userAgent"> = {}): Promise<Page> {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(NAME_SHIM);
  await page.evaluateOnNewDocument(TURNSTILE_HOOK);
  if (opts.proxyAuth) await page.authenticate(opts.proxyAuth);
  // Default UA says "HeadlessChrome", which many sites (and Cloudflare) block outright.
  const ua = opts.userAgent ?? (await browser.userAgent()).replace("HeadlessChrome", "Chrome");
  await page.setUserAgent(ua);
  return page;
}

/** Launch, hand a page to `fn`, always close the browser. */
export async function withPage<T>(fn: (page: Page, browser: Browser) => Promise<T>, opts: BrowserOptions = {}): Promise<T> {
  const browser = await launchBrowser(opts);
  try {
    const page = await newPage(browser, opts);
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}
