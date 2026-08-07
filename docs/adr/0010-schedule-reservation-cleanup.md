# Schedule reservation cleanup

Expired reservation cleanup will run from a protected scheduled job instead of public catalog reads. Public reads will remain read-only, while the scheduled job performs the inventory write transaction.

**Status**

The code did the opposite of this decision. `releaseExpiredReservations` was called from five places, none of them a scheduled job: the public product list, the public product detail page, catalog search, the cart read, and checkout. No cron trigger existed. Every visit to a product page therefore started an inventory write.

This is now corrected. A cron trigger runs every five minutes and calls the cleanup, the five piggyback calls are removed, and `src/server.ts` exports the `scheduled` handler next to `fetch`.

**Reconcile before cancelling**

The scheduled job must not cancel an order on age alone. It cancelled any order still in `pending_payment` past its reservation expiry, without asking the payment provider anything. That is safe only while a webhook reports payment within seconds. ADR-0005 makes the webhook optional, so it is not safe here.

Before it cancels an order that holds a Mayar transaction ID, the job now reads `GET /transactions/{id}`. A `paid` transaction completes the order instead of cancelling it. The job therefore reconciles, and cleanup is what it does when reconciliation finds no payment.

Without this, a buyer who pays and then closes the tab loses the order thirty minutes later while the money is already taken. That is ordinary buyer behaviour, not a rare case.

The Mayar API allows 50 requests per minute for each API key. The job reads at most a fixed number of pending orders per run, so a five minute schedule stays far below that limit.

A Cloudflare queue with a delayed message per order, and a Durable Object alarm per order, were both considered. Each releases stock at the exact second, but each also still needs a cron as a safety net, so both trade one mechanism for two. A thirty minute reservation released at minute thirty-three changes nothing for any buyer.

**Consequences**

- Public catalog reads stop writing, so they can carry cache headers.
- A product page can show stock as held by a dead reservation for up to five minutes longer than before. This is honest: the reservation is not released yet.
- On D1 the old behaviour would have been far worse than on Postgres, because every public catalog read would have become a write batch against the primary region.
