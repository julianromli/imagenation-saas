/**
 * The steps between a fresh deploy and an app that can take money.
 *
 * The same sequence is written out in "Quick start" and "After the first
 * deploy" in README.md. Editing one without the other lets them drift, so the
 * README points back here.
 *
 * Nothing in this file may carry a secret. The guide is reachable by anyone
 * until setup completes, which is exactly when it is shown.
 */
export type SetupGuideStep = {
  body: string;
  /** Shown as "Optional" so nobody is blocked by a step that does not block. */
  optional?: boolean;
  title: string;
  /** An in-app destination, when the step has one. */
  to?: "/credits" | "/setup";
};

export const setupGuideSteps: SetupGuideStep[] = [
  {
    body: "Enter the setup token you chose when you deployed. This creates your administrator account, checks that your OpenRouter key can reach the image model, and shows the Mayar webhook URL. It runs once.",
    title: "Create your administrator",
    to: "/setup",
  },
  {
    body: "Copy the URL the setup page shows into the Mayar dashboard at web.mayar.id, the same account the production API key belongs to. Payment is always proved by looking the transaction up with Mayar, and the checkout re-reads it while the buyer waits, so this only makes credits arrive faster.",
    optional: true,
    title: "Register the Mayar webhook",
  },
  {
    body: "Add BETTER_AUTH_URL as a Worker secret, set to your public URL. Without it, Better Auth reads the origin from each request and trusts whatever host served it.",
    title: "Set your public URL",
  },
  {
    body: "Put a spend limit on the OpenRouter key. It pays for every image this app generates, so the limit is what stops a bug or an abuser from draining the balance overnight.",
    title: "Cap the image spend",
  },
  {
    body: "The credit ladder and the pack prices in src/lib/pricing.ts were measured against a specific model price and a specific exchange rate. Check both before you charge anybody.",
    title: "Confirm the prices",
    to: "/credits",
  },
  {
    body: "Payments are live: MAYAR_ENVIRONMENT is production, so MAYAR_API_KEY must be a production key from web.mayar.id, and the payment channels you sell through must be switched on in that account. To test with play money instead, set MAYAR_ENVIRONMENT to sandbox and use a sandbox key.",
    title: "Use a production Mayar key",
  },
];
