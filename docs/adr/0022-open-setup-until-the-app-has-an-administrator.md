# Open setup until the app has an administrator

A one-click deploy still needs a first administrator. `/setup` stays that door. It is no longer guarded by `SETUP_TOKEN`: the page is open until `setup_completed` is written, then it refuses forever. `/auth` redirects to `/setup` until then, and the Better Auth HTTP routes for those actions return 403. The first visitor who completes the form becomes the administrator.

`ADMIN_EMAIL` stays rejected: this application does not verify email addresses, so anyone who guessed the owner's address could register first and take the admin role. See the rejected alternative in ADR-0014.

**Consequences**

- The deploy form asks for `BETTER_AUTH_SECRET`, `OPENROUTER_API_KEY`, and `MAYAR_API_KEY` only.
- `scripts/setup.ts` no longer mints `SETUP_TOKEN`.
- Setup creates the administrator, then checks the image key. A failure after sign-up deletes that account and releases the claim so the same email can retry.
- ADR-0009 still holds: an account that already exists is never promoted silently.
- The empty-app window is a race: whoever finishes `/setup` first operates the app.
