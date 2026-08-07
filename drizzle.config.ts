import "dotenv/config";

import { defineConfig } from "drizzle-kit";

// Generation only needs the dialect. Migrations are applied by
// `wrangler d1 migrations apply DB`, which reads the SQL files in ./drizzle.
// The d1-http credentials below are optional and only used by Drizzle Studio.
export default defineConfig({
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    databaseId: process.env.CLOUDFLARE_DATABASE_ID ?? "",
    token: process.env.CLOUDFLARE_D1_TOKEN ?? "",
  },
  dialect: "sqlite",
  driver: "d1-http",
  out: "./drizzle",
  schema: "./src/db/schema.ts",
});
