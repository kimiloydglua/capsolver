// Headless Chrome: open a page, auto-detect reCAPTCHA/Turnstile, solve, inject, (optionally) click submit.
// npm run cs -- run example-browser --url=https://example.com/login [--submit="button[type=submit]"]
import { autoSolve, withPage } from "../../browser/index.js";
import { defineModule } from "../types.js";

export default defineModule({
  name: "example-browser",
  description: "Open a page in headless Chrome, auto-solve its captcha (--url, [--submit=selector])",
  async run({ flags, log }) {
    if (typeof flags.url !== "string") throw new Error("--url is required");
    const url = flags.url;
    return withPage(async (page) => {
      await page.goto(url, { waitUntil: "networkidle2" });
      const result = await autoSolve(page);
      if (!result) {
        log("no supported captcha found");
        return null;
      }
      log(`${result.captcha.kind} solved (task ${result.taskId}), callback fired: ${result.callbackFired}`);
      if (typeof flags.submit === "string") {
        await Promise.all([page.waitForNavigation({ timeout: 30_000 }).catch(() => {}), page.click(flags.submit)]);
        log("landed on", page.url());
      }
      return { kind: result.captcha.kind, token: result.token.slice(0, 40) + "..." };
    });
  },
});
