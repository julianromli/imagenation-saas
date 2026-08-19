# Imagenation

**English** · [Bahasa Indonesia](README.id.md)

Sample Cloudflare app for **Mayar Native Custom Checkout**.

A credit-based AI image generator that runs entirely on Cloudflare, built with
TanStack Start, Better Auth, Drizzle ORM, D1, R2, OpenRouter, and Mayar V2
payments.

People sign up, get free credits, describe an image, and get one back. More
credits are bought as packs. There is no landing page: `/` is the app.

The buyer picks a pack and a channel. The Worker creates a Mayar invoice with
`paymentMethod` pinned. The dialog renders a QRIS string, a virtual account
number, or an e-wallet link. Nobody leaves the app. Nobody loads an iframe.
[kertaskerja-digital-store](https://github.com/mayarid/kertaskerja-digital-store)
is the sibling sample for the embedded (iframe) pattern.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/mayarid/imagenation-saas)

Everything the app needs is provisioned for you. Prepare two secrets before you
click: see [Environment variables](#environment-variables).

## Demo

https://github.com/user-attachments/assets/316ea786-53f7-4799-abe8-f5e2eb76cd40

## Stack

- TanStack Start (React 19) on Cloudflare Workers
- D1 for the database, through Drizzle ORM
- R2 for generated and reference images, served by the Worker
- Better Auth, self-hosted, with email and password sign-in
- OpenRouter for image generation, on `google/gemini-3.1-flash-image`
- Mayar V2 for selling credit packs
- Cloudflare rate limiting bindings and a cron trigger

## How Native Custom Checkout works

Use this repo to learn the native custom checkout pattern for Mayar Invoice API
v2. The buyer pays inside the app. The full settlement story is in
[Buying credits](#buying-credits).

1. The buyer picks a pack and a channel on `/credits`.
2. The Worker creates a Mayar invoice with `paymentMethod` pinned
   (`POST /hl/v2/invoices/create`).
3. Mayar answers with `paymentDetail` — a QRIS string, a virtual account
   number, or an e-wallet link — and the dialog renders it.
4. The dialog polls while the buyer pays. A webhook and a cron also watch.
5. Payment is proved by fetching the Mayar transaction and matching the amount,
   the `paid` status, and the purchase in `extraData`.
6. Credits are granted once, by a ledger entry whose reference is unique.

The files that implement this:

- [`src/lib/mayar.ts`](src/lib/mayar.ts) — invoice create with `paymentMethod`
- [`src/lib/payment-methods.ts`](src/lib/payment-methods.ts) — lenient
  `paymentDetail` parse
- [`src/components/credit-checkout-dialog.tsx`](src/components/credit-checkout-dialog.tsx)
  — in-app payment UI
- [`src/lib/purchase.ts`](src/lib/purchase.ts) — reuse, poll, settle
- [ADR-0021](docs/adr/0021-render-payment-instructions-in-our-own-ui.md)

Mayar V2 docs: [Create invoice](https://docs.mayar.id/api-reference-v2/invoice/create),
[Get invoice detail](https://docs.mayar.id/api-reference-v2/invoice/detail).

## Quick start

### Deploy from the button

1. Click **Deploy to Cloudflare**. Cloudflare forks the repository and creates
   the D1 database, the R2 bucket, and the rate limiters from `wrangler.jsonc`.
2. Fill in the two secrets. The form lists their names and nothing else, so
   [what the two secrets are](#what-the-two-secrets-are) explains each one.
   Have them ready before you click.
3. When the deploy finishes, open `https://<your-worker>.workers.dev`. The
   home page sends you to `/setup`. That page creates your administrator
   account, checks that your OpenRouter key can reach the image model, and
   shows the Mayar webhook URL to register. Sign-in stays closed until this
   finishes.
4. Work through [After the first deploy](#after-the-first-deploy). Setting
   `BETTER_AUTH_URL` is the one that matters most.

### What the two secrets are

Both come from another service. Nothing else is asked for, and neither can be
changed from inside the app afterwards — they are Worker secrets, edited in the
Cloudflare dashboard or with `wrangler secret put`.

There is no `BETTER_AUTH_SECRET` to set. The Worker generates it on first use
and stores it in D1, so sessions survive restarts and the deploy form stays
short. See [ADR-0023](docs/adr/0023-generate-the-auth-secret-on-first-use.md).

#### `OPENROUTER_API_KEY`

Pays for every generated image. Create one at
[openrouter.ai/settings/keys](https://openrouter.ai/settings/keys), then **put a
spend limit on it**. That limit is the only thing between a bug and your
balance.

#### `MAYAR_API_KEY`

Sells the credit packs. This app ships with `MAYAR_ENVIRONMENT` set to
`production`, so it has to be a production key from
[web.mayar.id/api-keys](https://web.mayar.id/api-keys). A sandbox key
authenticates against a different host and will simply be refused.

Want to take test payments first? On your fork, set `MAYAR_ENVIRONMENT` to
`sandbox` in `wrangler.jsonc` and use a key from
[web.mayar.io/api-keys](https://web.mayar.io/api-keys).

### Local development

Requires Bun 1.3 or newer.

```sh
git clone https://github.com/mayarid/imagenation-saas
cd imagenation-saas
bun install
bun run setup   # migrates the local D1 and prunes unused keys
bun dev
```

Then open `http://localhost:3000`. The home page sends you to `/setup`.

## Environment variables

D1, R2, and the rate limiters need no configuration. They are declared without
IDs in `wrangler.jsonc`, so Wrangler creates them locally on `wrangler dev` and
provisions them on your account at deploy time.

| Variable | Required | What it is |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | Yes | Pays for every generated image. **Put a spend limit on it.** |
| `MAYAR_API_KEY` | Yes | Sells credit packs. Sandbox and production keys differ. |
| `BETTER_AUTH_URL` | No | Your public URL. Without it, Better Auth reads the origin from each request. |
| `MAYAR_ENVIRONMENT` | No | `production` (default) or `sandbox`. Set in `wrangler.jsonc`. |

There is no `BETTER_AUTH_SECRET` to set. The Worker generates it on first use
and stores it in D1, so sessions survive restarts. See
[ADR-0023](docs/adr/0023-generate-the-auth-secret-on-first-use.md).

**Payments are live by default.** `MAYAR_ENVIRONMENT` is `production` in
`wrangler.jsonc`, so `MAYAR_API_KEY` has to be a production key from
[web.mayar.id](https://web.mayar.id/api-keys), and every checkout — including
one you start on `localhost` — creates a real invoice for real money.

To test with play money, put `MAYAR_ENVIRONMENT=sandbox` in `.dev.vars` and use
a key from [web.mayar.io](https://web.mayar.io/api-keys). `.dev.vars` beats
`wrangler.jsonc`, so that switches local development alone.

The checkout offers QRIS, virtual accounts, and e-wallets. A channel your Mayar
account has switched off fails when the invoice is created, so the list in
[`src/lib/payment-methods.ts`](src/lib/payment-methods.ts) has to match what
that account actually sells.

## After the first deploy

The home page sends you to `/setup` until the administrator exists. After that,
the remaining steps live on the admin overview as **Finish your app**. A buyer
never sees them. The copy lives in
[`src/lib/setup-guide.ts`](src/lib/setup-guide.ts) — edit that file and this
section together, or they drift.

1. Complete `/setup`.
2. Register the Mayar webhook URL shown on admin overview. This is optional;
   see [Buying credits](#buying-credits).
3. Set `BETTER_AUTH_URL` to your public URL. Recommended: without it, the origin
   check trusts whatever host served the request.
4. Put a spend limit on the OpenRouter key. It pays for every image, so the
   limit is what stops a bug or an abuser from draining the balance overnight.
5. Check the prices. See [Credits and prices](#credits-and-prices) — the numbers
   shipped here were measured against a specific model price and a specific
   exchange rate, and both move.
6. Payments are live from the deploy. If you chose sandbox for testing, switch
   `MAYAR_ENVIRONMENT` to production in `wrangler.jsonc` and swap in your
   production Mayar API key.
7. Consider where your D1 database lives. A one-click deploy cannot choose the
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

Checkout happens in a dialog on `/credits`. Nobody is sent to a payment page.

1. The buyer picks a pack and a channel. Mayar requires a mobile number on every
   invoice, so they are asked once and it is remembered.
2. The server creates a Mayar invoice pinned to that channel. Mayar answers with
   the payment instrument — a QRIS string, a virtual account number, or an
   e-wallet link — and the dialog renders it. A pending invoice for the same
   pack **and the same channel** is reused rather than replaced.
3. The dialog polls while the buyer pays. The reply says when to ask again, and
   a claim on the row means several tabs produce one request to Mayar between
   them.
4. Payment is proved by fetching the Mayar transaction detail and matching the
   amount, the `paid` status, and the purchase in `extraData`. A browser return
   never grants credits, and neither does a webhook payload on its own.
5. Credits are granted by a ledger entry whose reference is unique, so a
   replayed webhook, a poll, a re-check button, and the cron cannot grant twice.
6. Every five minutes a cron settles purchases whose webhook never arrived, and
   closes invoices that expired unpaid an hour ago.

Two things Mayar makes awkward, both handled rather than hidden. It refuses a
second invoice for one customer at one amount for a minute, so changing channel
straight away is reported as "wait a minute" instead of failing silently. And
the payment instrument is undocumented, so it is read leniently: anything
unrecognised falls back to a link to Mayar's own page. See
[ADR-0021](docs/adr/0021-render-payment-instructions-in-our-own-ui.md).

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
- `/setup` — one-time setup. Open until it completes, then closed.

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
