# Render payment instructions in our own UI

Supersedes the reuse rule, the invoice lifetime, and the hosted-redirect checkout described in ADR-0019. Everything else in ADR-0019 stands: packs are still sold as invoices built from `items[]` at request time, and nothing is provisioned on the operator's Mayar account.

Buying credits used to leave the app for Mayar's hosted invoice page. Mayar's V2 invoice create takes an optional `paymentMethod`, and pinning it makes Mayar issue the payment instrument on the create response: a QRIS string, a virtual account number, or an e-wallet link. The checkout now renders that instrument itself, in a dialog on `/credits`, and watches for the payment.

`POST /hl/v2/qr-codes/create` was rejected for QRIS. It returns `{ url, amount }` and nothing else — no transaction id, no `extraData` — so a payment made through it cannot be tied back to a purchase row, which is what ADR-0005 settlement depends on.

**`paymentDetail` is undocumented, so it is untrusted.** No V2 page defines it. Its shape here comes from sandbox payloads captured on 2026-08-12, and `GET /invoices/{id}` was checked at the same time: the field is on create only, so there is nowhere to re-fetch it from. `parseMayarPaymentDetail` therefore never throws, returns `null` for anything it does not recognise, and validates the URL scheme of every e-wallet link before that link reaches an `href`. A `null` leaves the buyer the hosted `link`, which the documentation does define. Only the normalized object is stored, never the provider's, and it is parsed again on read rather than trusted because we wrote it.

Nothing about this touches fulfillment. Credits are still granted only by `settleVerifiedPayment`, from a transaction read back from Mayar. The payment instrument is a rendering concern.

**Mayar's request budget is what sizes the design.** The key allows 50 requests a minute for everything the app does, and a browser watching a payment wants to ask often. Four things keep it inside that:

- `claimPurchaseRead` is a compare-and-swap on `last_checked_at`, written before the provider call. Several tabs, the cron, and the manual re-check produce one request between them, and a provider timeout backs the caller off instead of inviting a retry storm. Every read-back goes through `reconcilePurchase`, so no path can read Mayar without claiming first.
- A settled payment reuses the transaction its caller already read, instead of reading the same record twice.
- The cron drops to ten purchases a run and skips anything read in the last minute. Buyers now poll their own purchases, so what is left for the cron is closed tabs.
- The webhook candidate scan drops from twenty to five and is ordered by the payload's transaction hint. Ordering by an unsigned payload is not trusting it; the amount, `paid`, and `extraData.purchaseId` gate is unchanged.

The ceiling: a pending purchase costs at most four reads a minute for its first two minutes and one a minute after, so roughly ten concurrent checkouts plus the cron sits near 60% of the budget. The limit is per API key, so two Workers sharing a key halve it.

**Consequences**

- Reuse is keyed on the pack and the channel together, because an invoice carries one channel. A buyer who switches channel needs a new invoice, and Mayar refuses a second create for one customer at one amount for a minute — sandbox-verified, and a unique `description` does not defeat it. That minute is reported to the buyer rather than hidden.
- A superseded pending purchase is left pending, not expired. The cron only scans pending rows, so closing one early would strand a virtual account the buyer went on to pay. It dies at its own expiry instead. `listPurchases` hides pending rows with no payment URL, which are creates that failed after the row was written.
- The invoice lifetime drops from 24 hours to 1 hour, because a QRIS code and an e-wallet session are short-lived and a countdown beats a code that quietly stopped working. A virtual account is the awkward case, so a purchase is only closed an hour past expiry: without that grace, a payment landing between the last read and the status change would be money taken with no credits and nothing looking again.
- `POLL_LIMITER` is an abuse net, not the Mayar throttle. It is set at 60 a minute so a buyer with several tabs is not refused; the claim above is what protects the provider.
- `purchase.functions.ts` splits into `purchase.ts` and the server functions, matching `generation.ts`. The cron stops importing a module full of `createServerFn`, and the D1 tests can exercise the claim without rate-limit bindings.
- `outlet/alfamart` is documented by Mayar but not offered. Paying at a shop needs days, and an invoice here lives for an hour.
