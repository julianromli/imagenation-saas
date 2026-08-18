# Generate the auth secret on first use

The Deploy to Cloudflare button asks for every key in `.env.example`, and `BETTER_AUTH_SECRET` was one of them. The deployer does not choose that value — it is only entropy — so the field was one step too many for a one-click template.

ADR-0014 rejected generating it at runtime because a fresh value on every restart would sign every existing session out. Persisting the value removes that objection. The Worker now generates the secret on first use with Web Crypto and stores it in `setup_metadata` — the same table that already holds the Mayar webhook secret, which is generated the same way during `/setup`. The unique index on `key` settles the first-boot race: a concurrent writer inserts nothing and reads back the winner's value, so exactly one secret ever signs cookies.

Fetching the secret from a generator site at boot was rejected. The secret signs every session cookie, so it must not transit a third-party server, and a one-click deploy must not depend on an external service being reachable. Workers have Web Crypto built in; such a service adds nothing.

**Consequences**

- The deploy form asks for `OPENROUTER_API_KEY` and `MAYAR_API_KEY` only. `BETTER_AUTH_SECRET` leaves `.env.example`, `runtime-env.ts`, and `worker-configuration.d.ts`, and `scripts/setup.ts` prunes it from existing `.dev.vars` files.
- `getAuth()` is async: building Better Auth needs one D1 read, cached per isolate.
- The session secret sits in the database instead of the environment. Anyone who can read the D1 database can forge sessions — the same exposure as the webhook secret already stored there. See ADR-0005.
- There is no environment override. Rotating the secret means deleting the `auth_secret` row; the next request generates a new one and every session is signed out — the same blast radius as changing the variable before.
- Supersedes "the application requires `BETTER_AUTH_SECRET` in every environment" in ADR-0001 and "`BETTER_AUTH_SECRET` stays a deploy-form field" in ADR-0014.
