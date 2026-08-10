# Imagenation

**English** · [Bahasa Indonesia](README.id.md)

A credit-based AI image generator that runs entirely on Cloudflare, built with
TanStack Start, Better Auth, Drizzle ORM, D1, R2, OpenRouter, and Mayar V2
payments.

People sign up, get free credits, describe an image, and get one back. More
credits are bought as packs. There is no landing page: `/` is the app.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/julianromli/imagenation-saas)

Everything the app needs is provisioned for you. Prepare four secrets before you
click: see [Environment variables](#environment-variables).

## Stack

- TanStack Start (React 19) on Cloudflare Workers
- D1 for the database, through Drizzle ORM
- R2 for generated and reference images, served by the Worker
- Better Auth, self-hosted, with email and password sign-in
- OpenRouter for image generation, on `google/gemini-3.1-flash-image`
- Mayar V2 for selling credit packs
- Cloudflare rate limiting bindings and a cron trigger

## Quick start

### Deploy from the button

1. Click **Deploy to Cloudflare**. Cloudflare forks the repository and creates
   the D1 database, the R2 bucket, and the rate limiters from `wrangler.jsonc`.
2. Fill in the four secrets it asks for.
3. When the deploy finishes, open `https://<your-worker>.workers.dev/setup` and
   enter your setup token. That page creates your administrator account, checks
   that your OpenRouter key can reach the image model, and shows the Mayar
   webhook URL to register.

### Local development

Requires Bun 1.3 or newer.

```sh
git clone https://github.com/julianromli/imagenation-saas
cd imagenation-saas
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
| `OPENROUTER_API_KEY` | Yes | Pays for every generated image. **Put a spend limit on it.** |
| `MAYAR_API_KEY` | Yes | Sells credit packs. Sandbox and production keys differ. |
| `BETTER_AUTH_URL` | No | Your public URL. Without it, Better Auth reads the origin from each request. |
| `MAYAR_ENVIRONMENT` | No | `sandbox` (default) or `production`. Set in `wrangler.jsonc`. |

Keep `MAYAR_ENVIRONMENT=sandbox` until you have completed a test purchase.

## After the first deploy

A floating **?** button sits in the bottom-left corner of every page while setup
is unfinished, and opens this same checklist in a sheet. It disappears for good
once `/setup` completes, so a user never sees it. The steps live in
[`src/lib/setup-guide.ts`](src/lib/setup-guide.ts) — edit that file and this
section together, or they drift.

1. Complete `/setup`.
2. Register the Mayar webhook URL that the setup page shows. This is optional;
   see [Buying credits](#buying-credits).
3. Set `BETTER_AUTH_URL` to your public URL. Recommended: without it, the origin
   check trusts whatever host served the request.
4. Put a spend limit on the OpenRouter key. It pays for every image, so the
   limit is what stops a bug or an abuser from draining the balance overnight.
5. Check the prices. See [Credits and prices](#credits-and-prices) — the numbers
   shipped here were measured against a specific model price and a specific
   exchange rate, and both move.
6. Consider where your D1 database lives. A one-click deploy cannot choose the
   primary location. To move it, create a database with
   `wrangler d1 create <name> --location <hint>` and point the binding at it.

## Credits and prices

Everything below is one edit in [`src/lib/pricing.ts`](src/lib/pricing.ts).

| Resolution | Output at 16:9 | Credits | Typical wait |
| --- | --- | --- | --- |
| 1K | 1376×768 | 2 | ~11s |
| 2K | 2752×1536 | 3 | ~14s |
| 4K | 5504×3072 | 5 | ~30s |

Reference images are free — measured, they add about $0.0005 each. New accounts
get 4 credits. Packs ship at 20 / Rp 35,000, 60 / Rp 95,000, and 200 /
Rp 280,000.

**Why those numbers, and what to check before you change them:** the ladder is
proportional to measured upstream cost, planned at Rp 18,000 per USD, with a
floor of Rp 1,400 per credit. Your revenue is in rupiah and your OpenRouter bill
is in dollars, so a weaker rupiah eats the margin and nothing in the app will
tell you. The measurements, the arithmetic, and the reason there is no 512 tier
are all in [ADR-0018](docs/adr/0018-price-credits-from-measured-cost.md).

## Generating an image

1. The browser mints an idempotency key, stores it, and posts the prompt.
2. The Worker writes the `generation` row and takes the credits in **one** D1
   batch. A balance that would go negative is refused by a check constraint,
   which rolls the batch back. One account may have one generation in flight.
3. The model is called. The promise is handed to `waitUntil` **and** awaited, so
   a tab that closes mid-generation still gets its image into history.
4. On success the image is written to R2 under the owner's prefix, and
   `usage.cost` is recorded on the row.
5. On failure the credits come back — except for a prompt the provider blocked
   for content, which keeps them on purpose. Three blocks in an hour stop that
   account for a while.
6. Every five minutes a cron refunds any generation still stuck pending.

Images are private, served with `Cache-Control: private` behind a session check.
An owner can share one image at a time from `/history`, which mints a public
link at `/s/:token` and exempts that image from the 90-day retention sweep.

## Buying credits

1. The buyer picks a pack. Mayar requires a mobile number on every invoice, so
   they are asked once and it is remembered.
2. The server creates a Mayar invoice and stores its ids. A pending invoice for
   the same pack is reused rather than replaced, because Mayar answers a
   duplicate create with `429`.
3. Payment is proved by fetching the Mayar transaction detail and matching the
   amount, the `paid` status, and the purchase in `extraData`. A browser return
   never grants credits, and neither does a webhook payload on its own.
4. Credits are granted by a ledger entry whose reference is unique, so a
   replayed webhook, a re-check button, and the cron cannot grant twice.
5. Every five minutes a cron settles purchases whose webhook never arrived, and
   closes invoices that expired unpaid.

**The webhook is optional.** It only makes credits arrive faster. Because
payment is always proved by a transaction lookup, and because the cron
reconciles pending purchases, a deploy that never registers the webhook is still
correct.

Refunds are completed in the Mayar dashboard. Adjust the balance afterwards from
`/admin/accounts`, which writes a ledger entry with your reason on it.

## Routes

Public:

- `/` — the generator, usable signed out, with the button asking for sign-in
- `/auth` — sign in and create an account, on one page
- `/s/:token` — a shared image
- `/legal/privacy`, `/legal/terms`, `/legal/refund`
- `/setup` — one-time bootstrap, guarded by `SETUP_TOKEN`

Signed in:

- `/history` — every image, with its share toggle
- `/credits` — packs, purchases, and credit history
- `/account`

Admin:

- `/admin` — balances outstanding, images made, cost against revenue
- `/admin/accounts` — balances and manual adjustments
- `/admin/purchases` — every pack sold, with a re-check against Mayar
- `/admin/failures` — what failed, and whether it refunded

Server:

- `/api/auth/*` — Better Auth
- `/api/generate` — generate an image, requires an `Idempotency-Key`
- `/api/generations/:id` — rejoin a generation after a reload
- `/api/uploads` — reference image upload to R2
- `/api/shared/:token` — the bytes of a shared image, public and cacheable
- `/images/*` — private images, behind a session check
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
domain vocabulary in [`CONTEXT.md`](CONTEXT.md). Start with
[ADR-0016](docs/adr/0016-keep-the-credit-ledger-in-d1.md) for why the balance
cannot go negative, [ADR-0017](docs/adr/0017-run-generation-under-waituntil.md)
for what happens when a tab closes mid-generation, and
[ADR-0018](docs/adr/0018-price-credits-from-measured-cost.md) for the prices.

## Notes for maintainers

[`README.id.md`](README.id.md) is a full translation of this file. It is a
second copy of the same facts, so it drifts unless you edit both. The ADRs and
`CONTEXT.md` are English only, on purpose: they change more often and are read
by whoever is changing the code.

Wrangler writes provisioned resource IDs back into `wrangler.jsonc` after your
own first deploy. Do not commit those IDs: they are specific to your account,
and the bindings must stay ID-free for the deploy button to provision fresh
resources for everyone else.

### Change the rate limiter namespace IDs for a second deploy

`wrangler.jsonc` declares five rate limiters with the namespace IDs `2001`
through `2005`. A namespace ID is scoped to your whole Cloudflare account, not
to one Worker, and
[bindings that share one share their counters](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

So give each deploy its own numbers if either of these is true:

- You deploy this template more than once on the same account. A staging copy
  and a production copy on `2001` do not get a limit each. They get one limit
  between them, and traffic to either one uses it up.
- Another Worker on your account already uses a number in that range. The `1000`
  range belongs to the ecommerce template this was forked from.

One deploy on a fresh account needs no change.
