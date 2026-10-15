// API-only: get a reCAPTCHA v2 token without a browser.
// npm run cs -- run example-recaptcha --url=https://www.google.com/recaptcha/api2/demo --sitekey=6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-
import { config } from "../../config.js";
import { recaptchaV2 } from "../../tasks/index.js";
import { defineModule } from "../types.js";

export default defineModule({
  name: "example-recaptcha",
  description: "Solve a reCAPTCHA v2 via API only (--url, --sitekey, [--proxy])",
  async run({ flags, log }) {
    const websiteURL = String(flags.url ?? "https://www.google.com/recaptcha/api2/demo");
    const websiteKey = String(flags.sitekey ?? "6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-");
    const proxy = typeof flags.proxy === "string" ? flags.proxy : config.proxy;

    const res = await recaptchaV2({ websiteURL, websiteKey, proxy });
    log(`solved in ${res.elapsedMs}ms`);
    return { taskId: res.taskId, token: res.solution.gRecaptchaResponse };
  },
});
