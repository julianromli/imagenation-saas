import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { seedDatabase } from "@/db/seed";
import { getAuth } from "@/lib/auth";
import { createAccessToken, hashToken } from "@/lib/ids";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  claimSetup,
  readSetupValue,
  releaseSetupClaim,
  SETUP_COMPLETED_KEY,
  WEBHOOK_SECRET_KEY,
  writeSetupValue,
} from "@/lib/setup-metadata";

const setupSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(200),
  token: z.string().min(1),
});

/**
 * Held for the life of the isolate once it is true.
 *
 * Setup completion is a one-way door, which is what makes the cache safe. A
 * `false` is never held: an isolate that read one before setup finished would
 * otherwise keep offering the setup guide for as long as it lived.
 */
let setupCompleted = false;

async function isSetupComplete() {
  if (setupCompleted) {
    return true;
  }

  setupCompleted = (await readSetupValue(SETUP_COMPLETED_KEY)) !== null;

  return setupCompleted;
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(
  async () => ({
    complete: await isSetupComplete(),
    tokenConfigured: Boolean(getRuntimeEnv().SETUP_TOKEN),
  })
);

/**
 * Turns a fresh deploy into a usable store.
 *
 * A one-click deploy provisions the bindings and runs migrations, but nothing
 * creates the first administrator. Without this the store is live and nobody
 * can administer it. See ADR-0014.
 */
export const runSetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data }) => {
    // Consumed before the token is read, so a guess costs an attempt whatever
    // the outcome. Setup belongs to the store, not to a caller, so the key is
    // a constant.
    await consumeRateLimit("SETUP_LIMITER", "setup");

    const expectedToken = getRuntimeEnv().SETUP_TOKEN;

    if (!expectedToken) {
      throw new Error(
        "SETUP_TOKEN is not configured. Set it as a secret, then reload this page."
      );
    }

    // Compare digests, so how long the answer takes says nothing about how much
    // of the token a guess got right.
    const [given, expected] = await Promise.all([
      hashToken(data.token),
      hashToken(expectedToken),
    ]);

    if (given !== expected) {
      throw new Error("That setup token is not correct");
    }

    if (await isSetupComplete()) {
      throw new Error("Setup has already run for this store");
    }

    // Better Auth writes the account on its own and cannot join a D1 batch, so
    // the mutex is a claim row instead. Exactly one concurrent request wins it.
    if (!(await claimSetup())) {
      throw new Error("Setup is already running. Wait, then reload this page.");
    }

    try {
      const db = getDb();
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      // ADR-0009: an account that already exists is never promoted silently.
      if (existing) {
        throw new Error(
          "An account with that email already exists. Promote it deliberately instead."
        );
      }

      await getAuth().api.signUpEmail({
        body: {
          email: data.email,
          name: data.name,
          password: data.password,
        },
      });
      await db
        .update(users)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(users.email, data.email));

      const seeded = await seedDatabase();
      const webhookSecret = createAccessToken();

      await writeSetupValue(WEBHOOK_SECRET_KEY, { secret: webhookSecret });
      await writeSetupValue(SETUP_COMPLETED_KEY, {
        completedAt: new Date().toISOString(),
      });

      const { origin } = new URL(getRequest().url);

      return {
        seeded,
        webhookUrl: `${origin}/api/webhooks/mayar/${webhookSecret}`,
      };
    } catch (error) {
      // Free the claim so the operator can correct the input and try again.
      await releaseSetupClaim().catch(() => undefined);
      throw error;
    }
  });
