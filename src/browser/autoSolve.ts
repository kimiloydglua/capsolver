import type { Page } from "puppeteer";
import { mtcaptcha, recaptchaV2, recaptchaV3, turnstile } from "../tasks/index.js";
import { detectCaptchas, type DetectedCaptcha } from "./detect.js";
import { injectMtCaptchaToken, injectRecaptchaToken, injectTurnstileToken } from "./inject.js";

export interface AutoSolveOptions {
  proxy?: string;
  /** Needed for reCAPTCHA v3 when the action can't be read from the DOM. */
  recaptchaV3Action?: string;
  /** Treat detected render= keys as v3 (default true). */
  preferV3ForRenderKeys?: boolean;
}

export interface AutoSolveResult {
  captcha: DetectedCaptcha;
  token: string;
  taskId: string;
  callbackFired: boolean;
}

/**
 * Detect the first supported captcha on the page, solve it through CapSolver and inject the token.
 * Returns null if nothing supported was found.
 */
export async function autoSolve(page: Page, opts: AutoSolveOptions = {}): Promise<AutoSolveResult | null> {
  const websiteURL = page.url();
  const captchas = await detectCaptchas(page);

  for (const cap of captchas) {
    if (cap.kind === "recaptcha") {
      const isV3 = !!opts.recaptchaV3Action || (cap.invisible && !!cap.action && opts.preferV3ForRenderKeys !== false);
      const res = isV3
        ? await recaptchaV3({ websiteURL, websiteKey: cap.sitekey, pageAction: opts.recaptchaV3Action ?? cap.action ?? "verify", enterprise: cap.enterprise, proxy: opts.proxy })
        : await recaptchaV2({ websiteURL, websiteKey: cap.sitekey, isInvisible: cap.invisible, enterprise: cap.enterprise, pageAction: cap.action, proxy: opts.proxy });
      const token = res.solution.gRecaptchaResponse;
      return { captcha: cap, token, taskId: res.taskId, callbackFired: await injectRecaptchaToken(page, token) };
    }
    if (cap.kind === "turnstile") {
      const metadata = cap.action || cap.cdata ? { action: cap.action, cdata: cap.cdata } : undefined;
      const res = await turnstile({ websiteURL, websiteKey: cap.sitekey, metadata });
      const token = res.solution.token;
      return { captcha: cap, token, taskId: res.taskId, callbackFired: await injectTurnstileToken(page, token) };
    }
    if (cap.kind === "mtcaptcha") {
      const res = await mtcaptcha({ websiteURL, websiteKey: cap.sitekey, proxy: opts.proxy });
      const token = res.solution.token;
      return { captcha: cap, token, taskId: res.taskId, callbackFired: await injectMtCaptchaToken(page, token) };
    }
  }
  return null;
}
