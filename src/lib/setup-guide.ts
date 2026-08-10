/**
 * The steps between a fresh deploy and a store that can take money.
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
  to?: "/admin/products" | "/setup";
};

export const setupGuideSteps: SetupGuideStep[] = [
  {
    body: "Enter the setup token you chose when you deployed. This creates your administrator account, adds sample products, and shows the Mayar webhook URL. It runs once.",
    title: "Create your administrator",
    to: "/setup",
  },
  {
    body: "Copy the URL the setup page shows into the Mayar dashboard. Payment is always proved by looking the transaction up with Mayar, and a job reconciles orders every five minutes, so this only makes confirmation faster.",
    optional: true,
    title: "Register the Mayar webhook",
  },
  {
    body: "Add BETTER_AUTH_URL as a Worker secret, set to your public URL. Without it, Better Auth reads the origin from each request and trusts whatever host served it.",
    title: "Set your public URL",
  },
  {
    body: "The sample catalogue exists so the store is not empty on the first load. Replace it with your own products, prices, and images.",
    title: "Replace the sample products",
    to: "/admin/products",
  },
  {
    body: "Set MAYAR_ENVIRONMENT to production in wrangler.jsonc and swap in your production Mayar API key. Do this after one sandbox checkout has worked end to end, not before.",
    title: "Switch to live payments",
  },
];
