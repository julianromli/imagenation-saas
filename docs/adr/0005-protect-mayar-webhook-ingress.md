# Protect Mayar webhook ingress

Mayar webhook delivery will use an unguessable secret path because the documented contract does not provide a signature header. The endpoint will also enforce request-size, payload, and rate checks, and webhook data will never prove payment without a verified transaction lookup.

**Status of each guard**

Only the last guard was built. `processMayarWebhook` verifies the transaction before it accepts a payment, and rejects any event whose transaction mapping cannot be verified. The route itself had a guessable path, no size limit, and no rate check.

The three missing guards are now built as part of the Cloudflare migration:

- The route becomes `/api/webhooks/mayar/$secret`. The secret is generated once during setup and held in `setup_metadata`, and the setup page shows the full URL to register with Mayar. See ADR-0014.
- The rate check uses the binding from ADR-0015.
- The request size is capped before the body is parsed.

**The webhook is a trigger, not proof**

Registering the webhook is optional. Payment is proved only by `GET /transactions/{id}`, which must report the official `paid` status, the matching amount, and the matching order in `extraData`. A webhook payload never proves payment on its own, so removing the webhook takes nothing away from the evidence.

The same fulfillment path already runs from a poll. `refreshOrderPayment` reads the transaction, builds a verified `payment.received` payload, and passes it to `processMayarWebhook` with the transaction already verified. The order status page and the admin reconcile action both use it, and ADR-0010 makes the scheduled job do the same before it cancels anything.

A store that never registers the webhook is therefore still correct. It learns about a payment later, not never. This matters for the one-click deploy in ADR-0014, where registering the webhook is a manual step the owner may skip.

**Consequences**

- Without a signature header and without a secret path, the endpoint had no way at all to tell Mayar from a stranger at the gate. Transaction verification limits the money lost, but only after an attacker has already made the application write a `webhook_event` row and call the Mayar API.
- The secret lives in `setup_metadata`, not in a deploy form field, so it adds no field to the one-click deploy.
