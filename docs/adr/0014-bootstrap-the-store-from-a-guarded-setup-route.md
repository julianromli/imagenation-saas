# Bootstrap the store from a guarded setup route

The Deploy to Cloudflare button provisions the bindings and runs migrations through the deploy command, but nothing else. Without a further step, a one-click deploy produces a live store that nobody can administer. A `/setup` route, guarded by a `SETUP_TOKEN` secret set in the deploy form, will create the first admin account, seed the sample catalogue, generate the Mayar webhook secret, and show the webhook URL to register. The route marks `setup_metadata` when it finishes and refuses to run again.

Promoting whoever signs up with a configured `ADMIN_EMAIL` was rejected. This application does not verify email addresses, so anyone who guessed the shop owner's address could register first and take the admin role.

**Consequences**

- Bootstrap logic lives in one place. `scripts/setup.ts` shrinks to the work that needs a terminal: write `.dev.vars`, generate `BETTER_AUTH_SECRET`, apply local migrations, then point the developer at `/setup`. It no longer imports `src/lib/auth` or `src/db`.
- `BETTER_AUTH_SECRET` stays a deploy-form field. A Worker must not generate it at runtime, because every restart would then invalidate all sessions.
- `APP_URL` is no longer required. `getAppUrl()` falls back to the request origin, which is more correct here, because the deployed URL is unknown until the deploy finishes.
- The Mayar webhook is registered by hand from the URL shown on the setup page. A Worker cannot run the Mayar CLI.
