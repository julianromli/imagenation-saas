import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cloudflareTest,
  readD1Migrations,
} from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

const alias = {
  "@": fileURLToPath(new URL("./src", import.meta.url)),
  "cloudflare:workers": fileURLToPath(
    new URL("./src/lib/cloudflare-env-shim.ts", import.meta.url)
  ),
};

export default defineConfig({
  test: {
    projects: [
      // Pure unit tests. No database, no Workers runtime.
      {
        resolve: { alias },
        test: {
          environment: "node",
          exclude: ["src/**/*.d1.test.ts"],
          include: ["src/**/*.test.ts"],
          name: "unit",
        },
      },
      // Tests that need a real D1. The bindings are declared here rather than
      // read from wrangler.jsonc, so these tests never bundle the application
      // entry point. Keep the binding name in step with wrangler.jsonc.
      {
        plugins: [
          cloudflareTest(async () => ({
            miniflare: {
              bindings: {
                TEST_MIGRATIONS: await readD1Migrations(
                  resolve(import.meta.dirname, "drizzle")
                ),
              },
              // Pinned, and kept in step with wrangler.jsonc. Left unset, the
              // pool defaults to today's date, which the installed workerd
              // stops supporting the moment the calendar passes it.
              compatibilityDate: "2026-08-05",
              compatibilityFlags: ["nodejs_compat"],
              d1Databases: ["DB"],
            },
          })),
        ],
        resolve: { alias: { "@": alias["@"] } },
        test: {
          include: ["src/**/*.d1.test.ts"],
          name: "d1",
          setupFiles: ["./test/apply-migrations.ts"],
        },
      },
    ],
  },
});
