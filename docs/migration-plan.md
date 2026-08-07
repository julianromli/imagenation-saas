# Cloudflare migration plan

The decisions behind this plan are recorded in ADR-0011 to ADR-0015, and in the
amendments to ADR-0001, ADR-0003, ADR-0005, and ADR-0010. Read those for the
reasoning. This file records the order of work and why the order matters.

Items marked **[review]** come from a React performance review rather than from
the migration itself. They are folded in here because they touch the same files.

## Phase 0 — Remove what is leaving

No behaviour changes. Doing this first makes every later phase smaller.

- [x] Delete the seven unused components that each drag a dependency: `chart`,
      `carousel`, `calendar`, `resizable`, `input-otp`, `command`, and
      `message-scroller`. **[review]**
- [x] Drop the dependencies only those components used: `recharts`,
      `embla-carousel-react`, `react-day-picker`, `react-resizable-panels`,
      `input-otp`, `cmdk`, and `@shadcn/react`. Also drop `date-fns`, which
      nothing imports, and move `shadcn` to `devDependencies`, because it is a
      CLI. **[review]**
- [x] Delete `create-then-ecommerce/`.
- [x] Rename the project to `then-ecommerce-cf` in `package.json` and
      `wrangler.jsonc`.
- [ ] Decide what happens to the 34 remaining unused components. They cost no
      dependency, because they use `@base-ui/react`, which 38 files already
      import. See the open question at the end of this file. **[review]**

`@neondatabase/serverless` and `nitro` were deliberately **not** removed in this
phase. `src/db/index.ts` still imported the Neon driver until Phase 3, and
dropping the Nitro target changes which runtime `bun dev` uses, which belongs
with the Wrangler configuration in Phase 1. Phase 0 must not break the build.
Both are gone now.

## Phase 1 — Schema and configuration

- [x] Remove the Vercel target: drop `nitro`, the `CLOUDFLARE=1` flag, and the
      dual alias block in `vite.config.ts`, so one build target remains. Keep one
      small env module for Node tooling. Local development moves to `.dev.vars`.
- [x] Rewrite `src/db/schema.ts` against `sqlite-core`: seven enums to `text`,
      three `jsonb` columns to `text` in JSON mode, timestamps to `integer` in
      `timestamp_ms` mode.
- [x] Add `CHECK (available_stock >= 0)` to `product`. This carries the oversell
      guard from now on. See ADR-0012. A second check covers `reserved_stock`.
- [x] Rename `product_image.url` to `object_key`, and `order_item.image_url` to
      `image_object_key`. See ADR-0013.
- [x] Add the `checkout_request` table. See ADR-0003.
- [x] Drop the `rate_limit_bucket` table. See ADR-0015.
- [x] Delete the three Postgres migrations and `drizzle/meta/`, then generate one
      SQLite migration. No database has run the old ones.
- [x] Point `drizzle.config.ts` at `dialect: "sqlite"` with the `d1-http` driver.
- [x] Declare the bindings in `wrangler.jsonc` without IDs, so the deploy button
      can provision them: D1, R2, and four rate limiters. Add `migrations_dir`,
      the five minute cron trigger, and `main: "src/server.ts"`.
- [x] Confirm that `wrangler d1 migrations apply` reads the Drizzle output
      directory without tripping over `drizzle/meta/`. It does. `migrations_dir`
      belongs inside the `d1_databases` entry, not at the top level.
- [x] Prove the oversell guard by execution, not by reading. Applied to a local
      D1, `UPDATE product SET available_stock = available_stock - 5` against a
      row holding 1 fails with `CHECK constraint failed:
      product_available_stock_not_negative`, and the stock stays at 1.

## Phase 2 — Tests before the risky rewrite

The checkout rewrite replaces a guarantee that Postgres proved for years with two
claims this project has never executed. Write the tests first, so the rewrite has
something to fail against.

- [x] Split the Vitest configuration into two projects: the existing pure tests
      stay on the Node pool, and the new database tests run on
      `@cloudflare/vitest-pool-workers` against a local D1. The d1 project
      declares its bindings directly instead of reading `wrangler.jsonc`, so the
      tests never bundle the application entry point. Keep the `DB` binding name
      in step between the two files.
- [x] A statement that would take stock below zero is refused, and the stock is
      unchanged afterwards.
- [x] A batch that oversells on its second line rolls back the first line as
      well, and writes no order. **This is the claim the whole rewrite rests on,
      and it now has execution behind it rather than documentation.**
- [x] A batch where nothing fails commits every statement.
- [x] A replayed idempotency key violates the `checkout_request` primary key,
      which takes the duplicate order and the stock deduction down with it.

These four cover the mechanism at the database level, which is where the doubt
was. The scheduled-job tests were added in Phase 4, once the handler existed:

- [x] The scheduled job releases an expired reservation, returns the stock, and
      cancels the order.
- [x] The scheduled job does **not** cancel an expired order that Mayar reports as
      paid. Without a webhook this is ordinary behaviour, not an edge case. See
      ADR-0010.
- [x] The scheduled job leaves an order alone when Mayar cannot be reached, and
      retries on the next run.

One planned test was **not** written, deliberately. A test driving two concurrent
calls to `createOrderForCheckout` would need a request context, because checkout
reads the session through a server function. What such a test would prove — that
two checkouts cannot both take the last unit — is already proved directly against
D1 by the oversell and rollback tests above, and every checkout funnels into that
same single batch. The extra test would add setup, not confidence.

## Phase 3 — Data layer

- [x] Replace `src/db/index.ts` with the Drizzle D1 driver, then drop
      `@neondatabase/serverless`. `withTransaction` disappears; `runBatch()` takes
      its place.
- [x] Convert the 16 former transaction sites in `src/lib/inventory.ts`,
      `order.functions.ts`, `payment.functions.ts`, and `admin.functions.ts`.
      Several turned out to need no atomic unit at all: a single statement, or a
      compare-and-swap that is already atomic on its own.
- [x] Replace `ilike` in `catalog.functions.ts` with `like`. Drizzle offers
      `ilike` for Postgres only, and SQLite `LIKE` is already case-insensitive for
      ASCII. **[review]**
- [x] Wire the catalog filters that already exist, through `loaderDeps` so the
      loader reruns when the search changes. **[review]**
- [x] Add `getProductsByIds` and use it for the cart and checkout pages, behind
      the `useCartProducts` hook. **[review]**
- [x] Point Better Auth at `provider: "sqlite"`, enable `cookieCache` for five
      minutes, and pass `disableCookieCache: true` on the paths that read the
      admin role. See ADR-0001.
- [x] Rate limiting moved here from Phase 4, because the old module read a table
      that no longer exists and kept the build red.
- [x] Checkout requires an `Idempotency-Key` header, on both the server function
      and `/api/checkout`. A replay returns the original order with a freshly
      issued access token, because only the token hash is stored. See ADR-0003.
- [x] `productImageUrl()` derives an image address from an object key, so the one
      place that knows the address is one function. See ADR-0013.

## Phase 4 — Platform services

- [x] Add the R2 upload route and the image serving route with cache headers.
      Delete the three UploadThing modules and update the two components that
      called them. Deleting a product image now deletes the object as well, best
      effort.
- [x] Move rate limiting onto the bindings. Done in Phase 3.
- [x] Write `src/server.ts` exporting `fetch` and `scheduled`. `createServerEntry`
      returns a fresh object holding only `fetch`, so `scheduled` sits beside it
      in the default export rather than inside the call.
- [x] The scheduled handler reads Mayar before it cancels anything, at most 40
      orders per run. A provider call that fails leaves the order alone for the
      next run, because cancelling a paid order cannot be undone.
- [x] Remove the five calls to `releaseExpiredReservations`. Done in Phase 3.
- [x] Add cache headers to the public catalogue reads.
- [x] Move the webhook to `/api/webhooks/mayar/$secret`, cap the request size, and
      apply the rate limiter. See ADR-0005. Until setup generates the secret,
      the endpoint answers 404, which is the correct state for a store that has
      not been set up.
- [x] The three tests deferred from Phase 2 now exist: the sweep cancels an
      unpaid expired order and returns its stock; it does **not** cancel one that
      Mayar reports as paid; and it leaves an order alone when Mayar cannot be
      reached at all.

## Phase 5 — Onboarding

- [x] Build the `/setup` route behind `SETUP_TOKEN`: create the first admin, seed
      the catalogue, generate the webhook secret, show the webhook URL, then mark
      `setup_metadata` and refuse to run again.
- [x] Reduce `scripts/setup.ts` to the work that needs a terminal. It must no
      longer import `src/lib/auth` or `src/db`.
- [x] Rewrite `.env.example` as the secret list the deploy button reads. Remove
      `DATABASE_URL`, `UPLOADTHING_TOKEN`, and `APP_URL`. Add `SETUP_TOKEN`, and
      explain how to generate `BETTER_AUTH_SECRET`.
- [x] Add `"deploy": "wrangler d1 migrations apply DB --remote && wrangler deploy"`.
      Use the binding name, because the provisioned database name is unknown.
- [x] Rewrite the README for Cloudflare and replace both Vercel buttons with the
      Deploy to Cloudflare button. Document how to move the D1 primary location,
      which a one-click deploy cannot choose.

## Phase 6 — Verify

- [ ] A checkout in the Mayar sandbox, paid and confirmed.
- [ ] The same flow with no webhook registered: pay, return to the order page, and
      confirm the poll settles the order.
- [ ] Pay, close the tab, and let the reservation expire. The scheduled job must
      complete the order rather than cancel it.
- [ ] A deploy button run into an empty Cloudflare account, from the button to a
      first admin login.

## Open question

Thirty-four shadcn components have no importer and cost no dependency:
`accordion`, `alert-dialog`, `aspect-ratio`, `attachment`, `avatar`,
`breadcrumb`, `bubble`, `button-group`, `checkbox`, `collapsible`, `combobox`,
`context-menu`, `direction`, `drawer`, `hover-card`, `item`, `kbd`, `marker`,
`menubar`, `message`, `navigation-menu`, `pagination`, `popover`, `progress`,
`radio-group`, `scroll-area`, `select`, `sidebar`, `slider`, `spinner`, `switch`,
`tabs`, `toast`, and `toggle-group`.

Keeping them makes this a starter with a component library already in place.
Removing them makes it a store that carries only what it uses. Both are
defensible, and the choice says what the boilerplate is for. It is not blocking:
these files affect neither the deployed bundle nor the install.
