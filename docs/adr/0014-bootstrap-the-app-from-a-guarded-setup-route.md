# Bootstrap the app from a guarded setup route

The Deploy to Cloudflare button provisions the bindings and runs migrations through the deploy command, but nothing else. Without a further step, a one-click deploy produces a live app that nobody can administer. A `/setup` route, guarded by a `SETUP_TOKEN` secret set in the deploy form, will create the first admin account, generate the Mayar webhook secret, and show the webhook URL to register. The route marks `setup_metadata` when it finishes and refuses to run again.

Promoting whoever signs up with a configured `ADMIN_EMAIL` was rejected. This application does not verify email addresses, so anyone who guessed the owner's address could register first and take the admin role.

Rewritten when the ecommerce template became Imagenation. There is no longer a catalogue to seed: credit packs live in `src/lib/pricing.ts` and images are made on demand. Setup now verifies instead of seeding — it calls the OpenRouter model discovery endpoint, which costs nothing and generates no image, so a wrong `OPENROUTER_API_KEY` is found at setup time rather than by the first paying user.

**Consequences**

- Bootstrap logic lives in one place. `scripts/setup.ts` covers only the work that needs a terminal: write `.dev.vars`, generate `BETTER_AUTH_SECRET`, apply local migrations, then point the developer at `/setup`.
- `BETTER_AUTH_SECRET` stays a deploy-form field. A Worker must not generate it at runtime, because every restart would then invalidate all sessions.
- `BETTER_AUTH_URL` is not required. `getAppUrl()` falls back to the request origin, which is more correct here, because the deployed URL is unknown until the deploy finishes.
- The Mayar webhook is registered by hand from the URL shown on the setup page. A Worker cannot run the Mayar CLI.
- A failed image-key check does not fail setup. The administrator still exists, and the page says plainly that nobody can generate until the key is fixed.
