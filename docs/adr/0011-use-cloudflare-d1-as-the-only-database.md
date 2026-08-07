# Use Cloudflare D1 as the only database

This application will run entirely on the Cloudflare platform, so Neon Postgres will be replaced by Cloudflare D1 and the schema will move from Drizzle `pg-core` to `sqlite-core`. Hyperdrive with an external Postgres was considered and rejected: it keeps the application code unchanged, but it also keeps the data outside Cloudflare, which is the opposite of the goal.

**Consequences**

- Seven `pgEnum` types become `text` columns with a typed union in Drizzle. SQLite has no enum type. Drizzle infers the union but does not check it at runtime, so a status value is now only as safe as the typed code that writes it. Postgres refused a bad value at the database; SQLite will accept one from raw SQL.
- Three `jsonb` columns become `text` columns in JSON mode.
- Timestamps become `integer` columns in `timestamp_ms` mode. Time order stays correct as a number.
- The Vercel target is removed. Nitro, the Neon serverless driver, and the `CLOUDFLARE=1` build flag are deleted.
- D1 has no interactive transactions. See ADR-0012 for the replacement.
- D1 read replication stays off. It requires the Sessions API and a bookmark on every request, which is not worth the cost before there is real traffic.
- The Deploy to Cloudflare button cannot choose the D1 primary location. `--location` exists only on `wrangler d1 create`, so a one-click deploy takes the location Cloudflare picks.
