import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import { getDb } from "@/db";
import { authSchema } from "@/db/schema";
import { getAppUrl, getRuntimeEnv } from "@/lib/runtime-env";

const runtimeEnv = getRuntimeEnv();

export const auth = betterAuth({
  baseURL: getAppUrl(),
  database: drizzleAdapter(getDb({ allowMissing: true }), {
    provider: "pg",
    schema: authSchema,
  }),
  emailAndPassword: {
    enabled: true,
  },
  plugins: [tanstackStartCookies()],
  secret:
    runtimeEnv.BETTER_AUTH_SECRET ??
    "development-only-secret-change-this-during-setup",
  trustedOrigins: [getAppUrl()],
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
