# capsolver

A small Node.js/TypeScript toolkit for solving captchas with [CapSolver](https://capsolver.com).
It wraps the CapSolver API (reCAPTCHA, Turnstile, Cloudflare, GeeTest, AWS WAF, MTCaptcha, image captchas…),
can drive a headless Chrome to detect, solve and inject captcha tokens on real pages, and lets you add
your own automations as small "modules" run from a CLI.

Requirements: Node.js 20+ and a CapSolver API key.

---

Typed TypeScript wrapper around the CapSolver API (`api-en.yaml`), with headless Chrome (puppeteer) helpers and a folder-per-use-case module system.

## Setup
```bash
npm install
cp .env.example .env   # then set CAPSOLVER_API_KEY
npm run balance
```

## Layout
```
src/
  config.ts            .env loading
  core/client.ts       createTask / getTaskResult / getBalance / feedbackTask + solve() polling, Server-B fallback
  core/types.ts        task + solution types (SolutionFor<Task> gives the right solution shape)
  tasks/index.ts       recaptchaV2, recaptchaV3, turnstile, cloudflareChallenge, awsWaf, geetest,
                       datadomeSlider, mtcaptcha, imageToText, *Classify, visionEngine
  browser/             launchBrowser/withPage, detectCaptchas, inject*Token, applyCookies, autoSolve
  modules/             one folder per use case, auto-registered
  cli.ts
```

## Usage in code
```ts
import { solve, browser, getClient } from "./src/index.js";

const { solution } = await solve.recaptchaV2({ websiteURL, websiteKey });     // ProxyLess
const { solution: t } = await solve.turnstile({ websiteURL, websiteKey });
await browser.withPage(async (page) => {
  await page.goto(url);
  await browser.autoSolve(page);    // detect + solve + inject
});
await getClient().reportResult(task, taskId, true);  // feedbackTask
```
Passing `proxy` switches to the proxy variant of the task automatically.

## Adding a use case
```bash
cp -r src/modules/_template src/modules/my-site
# edit name/description/run in src/modules/my-site/index.ts
npm run cs -- list
npm run cs -- run my-site --foo=bar
```

## Module: worldofnations
Votes for World of Nations on all 4 sites and waits for worldofnations.fr to give the reward.
Needs `WON_EMAIL`, `WON_PASSWORD`, `WON_USERNAME` in `.env`.

| id | site | cooldown | captcha |
|---|---|---|---|
| 1 | serveur-prive.net | 1h30 | MTCaptcha |
| 2 | serveur-minecraft-vote.fr | 1h30 | Turnstile |
| 3 | serveur-minecraft.com | 3h | reCAPTCHA v2 |
| 5 | serveursminecraft.org | 24h | reCAPTCHA v2 (no name) |

```bash
npm run cs -- run worldofnations --dry-run   # everything except the final vote click (solves captchas, costs a bit of credit)
npm run cs -- run worldofnations             # vote once on every site that is off cooldown
npm run cs -- run worldofnations --loop      # run forever, vote as soon as each site is available
#   --sites=1,3   only some sites      --headful   show the browser
```
Cooldowns come from `GET https://worldofnations.fr/vote/user/<name>`, so it never tries a site early.
WON checks votes by IP, so run it from the same connection (no proxy). The browser profile (WON session)
is kept in `.data/won-profile`; screenshots of failures land in `.data/error-<id>.png`.
