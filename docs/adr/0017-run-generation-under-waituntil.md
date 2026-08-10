# Run generation under waitUntil, not on a queue

A generation takes between 11 and 30 seconds, measured. The credits are taken before the model is called. So the request that starts one must survive the browser that started it.

`POST /api/generate` writes the `generation` row and takes the credits in one batch, then starts the model call, hands that same promise to `waitUntil` from `cloudflare:workers`, and also awaits it to answer the request. A tab that stays open gets the image in the response. A tab that closes, drops, or navigates away still gets the image: `waitUntil` keeps the Worker alive, the row is settled, and the image lands in history.

Cloudflare Queues were rejected for the first version. A queue needs a paid plan and a consumer Worker, and it buys nothing here that `waitUntil` does not already give — waiting on `fetch` is not CPU time, so a 30-second upstream call is not the constraint. The constraint is the client connection, and `waitUntil` is exactly the tool for that.

The job row exists before any money is spent upstream. Without it, "my credits went and I got nothing" is unanswerable, and refunds are done by hand.

**Failure and refund**

- `429`, `502`, a timeout, and anything unexpected refund the credits.
- A `400` that the provider's message identifies as a content block does **not** refund. Refunding a blocked prompt makes probing the filter free. Three blocks in an hour stop that account from generating.
- A `400` that does not look like a content block refunds, and is recorded as `invalid`. It is more likely our malformed request than the user's prompt, and charging somebody for our own bug is worse than occasionally refunding a block.
- The refund is a ledger entry with `reason = 'refund'`, so the unique index refuses a second one.

**Consequences**

- A unique index on `generation(user_id) WHERE status = 'pending'` allows one in-flight generation per account. It bounds the memory a burst can hold — a 4K response arrives as 10.3MB of base64 — and removes the queue-jumping case for free.
- `GET /api/generations/:id` lets a reloaded tab rejoin. The browser also stores its idempotency key, so replaying it returns the original attempt rather than paying again. See ADR-0002.
- The five-minute cron refunds any generation still pending past its timeout. That is the backstop for an isolate evicted mid-flight, and a non-zero count of stuck rows in the admin means the cron is not running.
- `executeGeneration` never throws. It runs inside `waitUntil`, where a rejection would be lost and the row would stay pending until the cron swept it.
