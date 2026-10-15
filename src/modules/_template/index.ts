// Copy this folder to src/modules/<your-usecase>/ (no leading "_") and it is auto-registered.
// Run it with: npm run cs -- run <name> --some=flag
import { defineModule } from "../types.js";
// import { recaptchaV2, turnstile, ... } from "../../tasks/index.js";
// import { withPage, autoSolve } from "../../browser/index.js";

export default defineModule({
  name: "template",
  description: "Describe what this use case does",
  async run({ client, flags, log }) {
    log("flags:", flags);
    const { balance } = await client.getBalance();
    return { balance };
  },
});
