# Sell credit packs as Mayar invoices

Partly superseded by ADR-0021, which pins each invoice to one payment channel, renders the payment in our own UI, and changes the reuse rule and the invoice lifetime accordingly. The decision to sell packs as invoices built at request time is unchanged.

Credit packs are sold by creating a Mayar invoice per purchase. Mayar payment links and Mayar's own credit checkout were both rejected.

A payment link needs a Mayar product to exist first, which means `/setup` would have to create products on the operator's Mayar account and persist their ids. That is exactly the account-specific state this template avoids: `wrangler.jsonc` deliberately carries no binding ids so that a fresh operator supplies secrets and nothing else. An invoice is built from `items[]` at request time, so packs can live in code and nothing is provisioned anywhere.

Mayar's credit checkout would put the wallet back on Mayar's side, which ADR-0016 rejected.

Packs live in `src/lib/pricing.ts`, not in the database. An operator forking a boilerplate edits code anyway, and a database-backed pack editor is an admin screen that would have to be built and maintained for one user.

**Consequences**

- Mayar requires `name`, `email`, and `mobile` on every invoice. This app never had a reason to collect a phone number, so the buyer is asked once, at their first purchase, and it is kept on the user row. Somebody who only generates images is never asked.
- A pending, unexpired invoice for the same pack is reused rather than replaced. Mayar answers a duplicate create with `429` and a one-minute wait, so an impatient second click has to land on the first invoice.
- `extraData.purchaseId` links the transaction back to our row. It is read from the transaction we fetch ourselves, never from the webhook payload, which is unsigned. See ADR-0005 and ADR-0007.
- The credits are granted by the same settlement code whether a webhook or the reconciliation cron triggers it, and the ledger's unique reference index means running both cannot grant twice. See ADR-0016.
- An invoice that expires unpaid is closed by the cron, so it stops being examined on every run.
