# Keep self-hosted Better Auth

We will keep Better Auth self-hosted with the application. The decision holds after ADR-0011, but the database behind it changes: the Drizzle adapter moves from `provider: "pg"` on Neon HTTP to `provider: "sqlite"` on D1. A hosted identity provider remains a possible future migration, but it is not a drop-in fix because this application uses local auth tables, custom roles, server-side session checks, and user foreign keys.

**Consequences**

- Better Auth remains responsible for authentication routes and sessions.
- D1 is the database for auth operations. See ADR-0011.
- The application requires `BETTER_AUTH_SECRET` in every environment and refuses to start without it. A shared development fallback was removed: a deploy that forgot the secret would otherwise have signed its cookies with a value published in this repository.
- Session cookie caching is enabled with a five minute lifetime, so most requests verify a session without reading D1. Paths that check the admin role must pass `disableCookieCache: true`, because ADR-0014 changes a user role after the account already exists.
- Workers KV as secondary session storage was rejected. It is eventually consistent for up to about a minute, so a signed-out session could still pass in some locations, and cookie caching already removes the same reads without a further binding.
- A future migration to a hosted identity provider must include an explicit identity and authorization migration plan.
