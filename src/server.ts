import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import {
  pruneSettledWebhookEvents,
  reconcilePendingPurchases,
  refundStuckGenerations,
  sweepExpiredImages,
} from "@/lib/scheduled";

// `createServerEntry` returns a fresh object holding only `fetch`, so anything
// else passed to it would be dropped at runtime. The cron handler therefore
// sits beside it in the default export, which is what the Worker reads.
const startEntry = createServerEntry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

/** Each job is waited on separately, so one failure cannot stop the others. */
function run(name: string, job: Promise<unknown>) {
  return job
    .then((result) => {
      console.log(`${name}:`, JSON.stringify(result));
    })
    .catch((error) => {
      console.error(`${name} failed`, error);
    });
}

const server: ExportedHandler<Cloudflare.Env> = {
  fetch: (request) => startEntry.fetch(request),

  // Runs on the cron trigger declared in wrangler.jsonc.
  scheduled: (_controller, _env, context) => {
    // Credits taken for an image that never arrived come back here, and
    // nowhere else. This is the job that matters most. See ADR-0017.
    context.waitUntil(
      run("Stuck generation refunds", refundStuckGenerations())
    );

    // The webhook is optional, so this is what credits an account on a deploy
    // that never registered one. See ADR-0007.
    context.waitUntil(
      run("Purchase reconciliation", reconcilePendingPurchases())
    );

    // Independent of payments, so a provider outage does not stop retention.
    context.waitUntil(run("Image retention sweep", sweepExpiredImages()));
    context.waitUntil(
      run("Webhook retention sweep", pruneSettledWebhookEvents())
    );
  },
};

export default server;
