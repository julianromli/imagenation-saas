import handler, { createServerEntry } from "@tanstack/react-start/server-entry";

import {
  pruneSettledWebhookEvents,
  reconcileExpiredOrders,
} from "@/lib/scheduled";

// `createServerEntry` returns a fresh object holding only `fetch`, so anything
// else passed to it would be dropped at runtime. The cron handler therefore
// sits beside it in the default export, which is what the Worker reads.
const startEntry = createServerEntry({
  fetch(request: Request) {
    return handler.fetch(request);
  },
});

const server: ExportedHandler<Cloudflare.Env> = {
  fetch: (request) => startEntry.fetch(request),

  // Runs on the cron trigger declared in wrangler.jsonc. Public reads no longer
  // clean up expired reservations, so this is the only thing that does.
  // See ADR-0010.
  scheduled: (_controller, _env, context) => {
    context.waitUntil(
      reconcileExpiredOrders()
        .then((result) => {
          console.log(
            `Reservation sweep: examined ${result.examined}, settled ${result.settled}, cancelled ${result.cancelled}, skipped ${result.skipped}, ${result.remaining} left for the next run`
          );
        })
        .catch((error) => {
          console.error("Reservation sweep failed", error);
        })
    );

    // Independent of the sweep, so a provider outage does not stop retention.
    context.waitUntil(
      pruneSettledWebhookEvents()
        .then((removed) => {
          if (removed > 0) {
            console.log(`Pruned ${removed} settled webhook events`);
          }
        })
        .catch((error) => {
          console.error("Webhook retention sweep failed", error);
        })
    );
  },
};

export default server;
