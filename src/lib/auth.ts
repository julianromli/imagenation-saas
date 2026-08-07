import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { getDb } from "@/db";
import { authSchema } from "@/db/schema";
import { getRuntimeEnv } from "@/lib/runtime-env";

const DEVELOPMENT_SECRET = "development-only-secret-change-this-during-setup";

// Five minutes. Long enough to remove most session reads from D1, short enough
// that a revoked session stops working quickly. See ADR-0001.
const COOKIE_CACHE_SECONDS = 5 * 60;

/**
 * Better Auth is built on first use rather than at module load, because the D1
 * binding belongs to the Worker and the adapter needs it.
 *
 * `baseURL` is deliberately unset. A one-click deploy does not know its own URL
 * until the deploy finishes, so Better Auth reads `BETTER_AUTH_URL` when it is
 * present and otherwise derives the origin from the request. Setting
 * `BETTER_AUTH_URL` after the first deploy is recommended: request inference
 * makes the origin check trust whatever host served the request.
 */
function createAuth() {
  return betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema: authSchema,
    }),
    emailAndPassword: {
      enabled: true,
    },
    plugins: [tanstackStartCookies()],
    secret: getRuntimeEnv().BETTER_AUTH_SECRET ?? DEVELOPMENT_SECRET,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: COOKIE_CACHE_SECONDS,
      },
    },
    user: {
      additionalFields: {
        role: {
          defaultValue: "customer",
          input: false,
          type: "string",
        },
      },
    },
  });
}

let instance: ReturnType<typeof createAuth> | undefined;

export function getAuth() {
  instance ??= createAuth();

  return instance;
}

/**
 * Reads the session while bypassing the cookie cache. Use this wherever the
 * decision depends on `role`, because setup promotes an account that already
 * exists and a cached cookie would hold the old role. See ADR-0014.
 */
export function getFreshSession(headers: Headers) {
  return getAuth().api.getSession({
    headers,
    query: { disableCookieCache: true },
  });
}
