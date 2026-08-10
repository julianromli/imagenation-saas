# then. ecommerce boilerplate

A single-merchant ecommerce starter that runs entirely on Cloudflare, built with
TanStack Start, Better Auth, Drizzle ORM, D1, R2, and Mayar V2 payments.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/julianromli/then-ecommerce-cf)

Everything the store needs is provisioned for you. Prepare three secrets before
you click: see [Environment variables](#environment-variables).

## Stack

- TanStack Start (React 19) on Cloudflare Workers
- D1 for the database, through Drizzle ORM
- R2 for product images, uploaded and served by the Worker
- Better Auth, self-hosted, with email and password sign-in
- Mayar V2 for payments
- Cloudflare rate limiting bindings and a cron trigger

## Quick start

### Deploy from the button

1. Click **Deploy to Cloudflare**. Cloudflare forks the repository and creates
   the D1 database, the R2 bucket, and the rate limiters from `wrangler.jsonc`.
2. Fill in the three secrets it asks for.
3. When the deploy finishes, open `https://<your-worker>.workers.dev/setup` and
   enter your setup token. That page creates your administrator account, adds
   sample products, and shows the Mayar webhook URL to register.

### Local development

Requires Bun 1.3 or newer.

```sh
git clone https://github.com/julianromli/then-ecommerce-cf
cd then-ecommerce-cf
bun install
bun run setup   # writes .dev.vars, mints secrets, migrates the local D1
bun dev
```

Then open `http://localhost:3000/setup` and use the token that `bun run setup`
printed.

## Environment variables

D1, R2, and the rate limiters need no configuration. They are declared without
IDs in `wrangler.jsonc`, so Wrangler creates them locally on `wrangler dev` and
provisions them on your account at deploy time.

| Variable | Required | What it is |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Yes | Signs session cookies. Generate with `openssl rand -base64 32`. Changing it signs everyone out. |
| `SETUP_TOKEN` | Yes | Unlocks the one-time `/setup` page. Any long random string. |
| `MAYAR_API_KEY` | Yes | Mayar API key. Sandbox and production keys differ. |
| `BETTER_AUTH_URL` | No | Your public URL. Without it, Better Auth reads the origin from each request. |
| `MAYAR_ENVIRONMENT` | No | `sandbox` (default) or `production`. Set in `wrangler.jsonc`. |
| `SHIPPING_FLAT_RATE` | No | Flat shipping in IDR, applied once per order. Set in `wrangler.jsonc`. |

Keep `MAYAR_ENVIRONMENT=sandbox` until you have completed a test checkout.

## After the first deploy

1. Complete `/setup`.
2. Register the Mayar webhook URL that the setup page shows. This is optional;
   see [Payment lifecycle](#payment-lifecycle).
3. Set `BETTER_AUTH_URL` to your public URL. Recommended: without it, the origin
   check trusts whatever host served the request.
4. Consider where your D1 database lives. A one-click deploy cannot choose the
   primary location. To move it, create a database with
   `wrangler d1 create <name> --location <hint>` and point the binding at it.

## Payment lifecycle

1. Checkout reserves available stock for 30 minutes and writes the order,
   its items, the reservation, and the idempotency record in a single D1 batch.
   Overselling is refused by a check constraint, which rolls the batch back.
2. The server creates a Mayar invoice from the order snapshot.
3. The customer pays and returns to the order status page.
4. Payment is proved by fetching the Mayar transaction detail and matching the
   amount, the `paid` status, and the order in `extraData`. A browser return
   never marks an order paid, and neither does a webhook payload on its own.
5. The order status page checks payment on load, on a short retry schedule, and
   when the tab regains focus.
6. Every five minutes a cron trigger reconciles orders whose reservation has
   expired. It asks Mayar first: a paid order is settled, an unpaid one is
   cancelled and its stock returned, and an order it cannot verify is left for
   the next run.
7. Admin payment resync uses the same evidence gate as the customer refresh.

**The webhook is optional.** It only makes confirmation faster. Because payment
is always proved by a transaction lookup, and because the cron reconciles
expired orders, a store that never registers the webhook is still correct.

Refunds are completed in the Mayar dashboard and then marked as refunded in the
admin panel. No undocumented refund endpoint is called.

## Routes

Public:

- `/` — storefront landing page
- `/products` — collection, category filters, and search
- `/products/:slug` — product detail
- `/cart` — local cart
- `/checkout` — guest checkout and shipping address
- `/orders/:token` — signed guest order status
- `/orders/find` — recover a guest order with email + order number
- `/sign-in`, `/sign-up`, `/account`, `/account/orders`
- `/legal/privacy`, `/legal/terms`, `/legal/shipping`, `/legal/refund`
- `/setup` — one-time bootstrap, guarded by `SETUP_TOKEN`

Admin:

- `/admin` — overview
- `/admin/products` — categories, product creation and archive, image upload
- `/admin/orders` — order list and payment/fulfilment actions
- `/admin/orders/:id` — order detail, resync, status history, manual refund

Server:

- `/api/auth/*` — Better Auth
- `/api/checkout` — server checkout endpoint, requires an `Idempotency-Key`
- `/api/uploads` — admin image upload to R2
- `/images/*` — product images served from R2
- `/api/webhooks/mayar/:secret` — Mayar webhook receiver

## Useful commands

```sh
bun dev                  # local dev server on the Workers runtime
bun run build            # build the Worker bundle
bun run deploy           # apply remote migrations, then deploy
bun run db:generate      # generate a migration from the Drizzle schema
bun run db:migrate       # apply migrations to the local D1
bun run db:migrate:remote# apply migrations to the deployed D1
bun run test             # unit tests and D1 tests
bun run typecheck        # TypeScript
bun run lint             # Biome via Ultracite
bun run cf-typegen       # regenerate binding types after editing wrangler.jsonc
```

## Design decisions

The reasoning behind the architecture lives in [`docs/adr/`](docs/adr/), and the
domain vocabulary in [`CONTEXT.md`](CONTEXT.md). Start with ADR-0011 for the
database choice and ADR-0012 for how checkout stays atomic without transactions.

## Notes for maintainers

Wrangler writes provisioned resource IDs back into `wrangler.jsonc` after your
own first deploy. Do not commit those IDs: they are specific to your account,
and the bindings must stay ID-free for the deploy button to provision fresh
resources for everyone else.

### Change the rate limiter namespace IDs for a second store

`wrangler.jsonc` declares six rate limiters with the namespace IDs `1001`
through `1006`. A namespace ID is scoped to your whole Cloudflare account, not
to one Worker, and
[bindings that share one share their counters](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

So give each store its own numbers if either of these is true:

- You deploy this template more than once on the same account. A staging store
  and a production store on `1001` do not get a limit each. They get one limit
  between them, and traffic to either one uses it up.
- Another Worker on your account already uses a number in that range.

One store on a fresh account needs no change.
