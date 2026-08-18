/**
 * The steps after the administrator exists and before the app takes live
 * money.
 *
 * Shown on the admin overview. The same sequence is written out in "After the
 * first deploy" in README.md. Editing one without the other lets them drift.
 *
 * Nothing in this file may carry a secret.
 */
export type SetupGuideStep = {
  body: string;
  id:
    | "administrator"
    | "prices"
    | "production-key"
    | "public-url"
    | "spend-limit"
    | "webhook";
  /** Shown as "Optional" so nobody is blocked by a step that does not block. */
  optional?: boolean;
  title: string;
  /** An in-app destination, when the step has one. */
  to?: "/credits";
};

export const setupGuideSteps: SetupGuideStep[] = [
  {
    body: "Open /setup and create the first administrator. This checks that your OpenRouter key can reach the image model, and shows the Mayar webhook URL. It runs once.",
    id: "administrator",
    title: "Create your administrator",
  },
  {
    body: "Copy the webhook URL from this page into the Mayar dashboard. Payment is always proved by looking the transaction up with Mayar, and the checkout re-reads it while the buyer waits, so this only makes credits arrive faster.",
    id: "webhook",
    optional: true,
    title: "Register the Mayar webhook",
  },
  {
    body: "Add BETTER_AUTH_URL as a Worker secret, set to your public URL. Without it, Better Auth reads the origin from each request and trusts whatever host served it.",
    id: "public-url",
    title: "Set your public URL",
  },
  {
    body: "Put a spend limit on the OpenRouter key. It pays for every image this app generates, so the limit is what stops a bug or an abuser from draining the balance overnight.",
    id: "spend-limit",
    title: "Cap the image spend",
  },
  {
    body: "The credit ladder and the pack prices in src/lib/pricing.ts were measured against a specific model price and a specific exchange rate. Check both before you charge anybody.",
    id: "prices",
    title: "Confirm the prices",
    to: "/credits",
  },
  {
    body: "Deploys default to production, so this is usually done already. If you deployed with sandbox for testing, set MAYAR_ENVIRONMENT to production in wrangler.jsonc and swap in your production Mayar API key.",
    id: "production-key",
    title: "Use a production Mayar key",
  },
];
