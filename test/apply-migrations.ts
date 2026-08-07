import { applyD1Migrations, env } from "cloudflare:test";
import type { D1Migration } from "@cloudflare/vitest-pool-workers";

// `TEST_MIGRATIONS` is supplied by the d1 project in vitest.config.ts. It is a
// test-only binding, so it is typed here rather than added to the production Env.
const testEnv = env as Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };

// Each test worker starts with an empty D1. Run the same migration files that
// `wrangler d1 migrations apply` runs, so the tests exercise the real schema,
// including the check constraints that carry the oversell guard.
await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
