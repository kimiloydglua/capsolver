import type { Page } from "puppeteer";
import { ensureShim } from "./launch.js";

/**
 * Put a reCAPTCHA token into every g-recaptcha-response textarea and fire the widget callback if one exists.
 * You still have to submit the form / trigger the site's own request afterwards.
 */
export async function injectRecaptchaToken(page: Page, token: string): Promise<boolean> {
  await ensureShim(page);
  return page.evaluate((tok) => {
    let areas = [...document.querySelectorAll<HTMLTextAreaElement>('textarea[name="g-recaptcha-response"], #g-recaptcha-response')];
    if (areas.length === 0) {
      const ta = document.createElement("textarea");
      ta.name = "g-recaptcha-response";
      ta.style.display = "none";
      (document.querySelector("form") ?? document.body).appendChild(ta);
      areas = [ta];
    }
    for (const ta of areas) {
      ta.value = tok;
      ta.innerHTML = tok;
    }

    // Fire data-callback attribute
    let fired = false;
    const cbName = document.querySelector(".g-recaptcha")?.getAttribute("data-callback");
    if (cbName && typeof (window as any)[cbName] === "function") {
      (window as any)[cbName](tok);
      fired = true;
    }
    // Fire callbacks registered via grecaptcha.render({callback})
    const cfg = (window as any).___grecaptcha_cfg?.clients;
    if (!fired && cfg) {
      const walk = (o: any, depth: number): void => {
        if (!o || typeof o !== "object" || depth > 4 || fired) return;
        for (const v of Object.values(o)) {
          if (v && typeof v === "object" && typeof (v as any).callback === "function") {
            (v as any).callback(tok);
            fired = true;
            return;
          }
          walk(v, depth + 1);
        }
      };
      walk(cfg, 0);
    }
    return fired;
  }, token);
}

export async function injectTurnstileToken(page: Page, token: string): Promise<boolean> {
  await ensureShim(page);
  return page.evaluate((tok) => {
    let inputs = [...document.querySelectorAll<HTMLInputElement>('input[name="cf-turnstile-response"]')];
    if (inputs.length === 0) {
      const el = document.createElement("input");
      el.type = "hidden";
      el.name = "cf-turnstile-response";
      (document.querySelector(".cf-turnstile")?.closest("form") ?? document.querySelector("form") ?? document.body).appendChild(el);
      inputs = [el];
    }
    for (const i of inputs) i.value = tok;
    // Callbacks captured by the turnstile.render hook installed in newPage()
    const hooked = ((window as any).__csTurnstile ?? []) as { callback?: (t: string) => void }[];
    let fired = false;
    for (const params of hooked) {
      if (typeof params.callback === "function") {
        params.callback(tok);
        fired = true;
      }
    }
    if (fired) return true;
    const cbName = document.querySelector(".cf-turnstile")?.getAttribute("data-callback");
    if (cbName && typeof (window as any)[cbName] === "function") {
      (window as any)[cbName](tok);
      return true;
    }
    return false;
  }, token);
}

/** Apply cookies returned by AWS WAF / DataDome / Cloudflare tasks to the page's domain. */
export async function applyCookies(page: Page, url: string, cookies: Record<string, string> | string): Promise<void> {
  const { hostname } = new URL(url);
  const pairs: [string, string][] =
    typeof cookies === "string"
      ? cookies.split(";").map((c) => c.trim()).filter(Boolean).map((c) => {
          const i = c.indexOf("=");
          return [c.slice(0, i), c.slice(i + 1)] as [string, string];
        }).filter(([k]) => !/^(path|domain|expires|max-age|secure|httponly|samesite)$/i.test(k))
      : Object.entries(cookies);
  await page.browserContext().setCookie(...pairs.map(([name, value]) => ({ name, value, domain: hostname, path: "/" })));
}

/** Fill MTCaptcha's hidden verified-token input(s) and fire the configured verified-callback. */
export async function injectMtCaptchaToken(page: Page, token: string): Promise<boolean> {
  await ensureShim(page);
  return page.evaluate((tok) => {
    const inputs = [...document.querySelectorAll<HTMLInputElement>('input.mtcaptcha-verifiedtoken, input[name="mtcaptcha-verifiedtoken"]')];
    for (const i of inputs) i.value = tok;
    const cb = (window as any).mtcaptchaConfig?.["verified-callback"];
    const fn = typeof cb === "function" ? cb : typeof cb === "string" ? (window as any)[cb] : undefined;
    if (typeof fn === "function") fn({ verifiedToken: tok, isVerified: true });
    return inputs.length > 0;
  }, token);
}
