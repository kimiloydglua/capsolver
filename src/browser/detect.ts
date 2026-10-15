import type { Page } from "puppeteer";
import { ensureShim } from "./launch.js";

export type DetectedCaptcha =
  | { kind: "recaptcha"; sitekey: string; invisible: boolean; enterprise: boolean; action?: string }
  | { kind: "turnstile"; sitekey: string; action?: string; cdata?: string }
  | { kind: "hcaptcha"; sitekey: string }
  | { kind: "geetest"; gt?: string; captchaId?: string }
  | { kind: "mtcaptcha"; sitekey: string };

/** Scan the page (DOM + iframes + script URLs) for known captcha widgets. */
export async function detectCaptchas(page: Page): Promise<DetectedCaptcha[]> {
  await ensureShim(page);
  return page.evaluate(() => {
    const found: any[] = [];
    const seen = new Set<string>();
    const push = (c: any) => {
      const k = JSON.stringify(c);
      if (!seen.has(k)) { seen.add(k); found.push(c); }
    };
    const scripts = [...document.querySelectorAll("script[src]")].map((s) => (s as HTMLScriptElement).src);
    const enterprise = scripts.some((s) => s.includes("recaptcha/enterprise"));

    // reCAPTCHA widgets
    document.querySelectorAll(".g-recaptcha[data-sitekey], [data-sitekey].g-recaptcha").forEach((el) => {
      push({
        kind: "recaptcha",
        sitekey: el.getAttribute("data-sitekey")!,
        invisible: el.getAttribute("data-size") === "invisible",
        enterprise,
        action: el.getAttribute("data-action") ?? undefined,
      });
    });
    document.querySelectorAll('iframe[src*="recaptcha"]').forEach((f) => {
      const u = new URL((f as HTMLIFrameElement).src);
      const k = u.searchParams.get("k");
      if (k) push({ kind: "recaptcha", sitekey: k, invisible: u.searchParams.get("size") === "invisible", enterprise: u.pathname.includes("enterprise") });
    });
    // reCAPTCHA v3 via render=<key>
    for (const s of scripts) {
      if (!s.includes("recaptcha")) continue;
      const render = new URL(s).searchParams.get("render");
      if (render && render !== "explicit") push({ kind: "recaptcha", sitekey: render, invisible: true, enterprise });
    }

    // Turnstile
    document.querySelectorAll(".cf-turnstile[data-sitekey]").forEach((el) => {
      push({
        kind: "turnstile",
        sitekey: el.getAttribute("data-sitekey")!,
        action: el.getAttribute("data-action") ?? undefined,
        cdata: el.getAttribute("data-cdata") ?? undefined,
      });
    });

    // Turnstile rendered explicitly from JS (captured by the hook in newPage)
    for (const params of ((window as any).__csTurnstile ?? []) as any[]) {
      if (params?.sitekey) push({ kind: "turnstile", sitekey: params.sitekey, action: params.action, cdata: params.cData });
    }

    // hCaptcha (detected only; CapSolver dropped hCaptcha support)
    document.querySelectorAll(".h-captcha[data-sitekey]").forEach((el) => {
      push({ kind: "hcaptcha", sitekey: el.getAttribute("data-sitekey")! });
    });

    // MTCaptcha
    const mt = (window as any).mtcaptchaConfig;
    if (mt?.sitekey) push({ kind: "mtcaptcha", sitekey: mt.sitekey });
    document.querySelectorAll('iframe[src*="mtcaptcha.com"]').forEach((f) => {
      const k = new URL((f as HTMLIFrameElement).src).searchParams.get("sitekey");
      if (k) push({ kind: "mtcaptcha", sitekey: k });
    });

    // GeeTest v4 (captcha_id in script/iframe URLs)
    for (const s of scripts) {
      if (!s.includes("geetest")) continue;
      const id = new URL(s).searchParams.get("captcha_id");
      if (id) push({ kind: "geetest", captchaId: id });
    }
    return found;
  });
}
