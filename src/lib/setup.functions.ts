import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { createAccessToken } from "@/lib/ids";
import { verifyImageModelAccess } from "@/lib/openrouter";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/runtime-env";
import {
  claimSetup,
  releaseSetupClaim,
  SETUP_COMPLETED_KEY,
  WEBHOOK_SECRET_KEY,
  writeSetupValue,
} from "@/lib/setup-metadata";
import { isSetupComplete } from "@/lib/setup-status";

const setupSchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(200),
});

export const getSetupStatus = createServerFn({ method: "GET" }).handler(
  async () => ({
    complete: await isSetupComplete(),
  })
);

function deleteAccountByEmail(email: string) {
  return getDb().delete(users).where(eq(users.email, email));
}

/**
 * Turns a fresh deploy into a usable app.
 *
 * A one-click deploy provisions the bindings and runs migrations, but nothing
 * creates the first administrator. Without this the app is live and nobody can
 * administer it. See ADR-0022.
 *
 * There is nothing to seed: credit packs live in `src/lib/pricing.ts` and
 * images are made on demand. What this does instead is check the image key,
 * because a wrong `OPENROUTER_API_KEY` should be found here and not by the
 * first paying user.
 */
export const runSetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data }) => {
    // Setup belongs to the app, not to a caller, so the key is a constant.
    await consumeRateLimit("SETUP_LIMITER", "setup");

    if (await isSetupComplete()) {
      throw new Error("Setup has already run for this app");
    }

    // Better Auth writes the account on its own and cannot join a D1 batch, so
    // the mutex is a claim row instead. Exactly one concurrent request wins it.
    if (!(await claimSetup())) {
      throw new Error("Setup is already running. Wait, then reload this page.");
    }

    let existedBefore = false;

    try {
      const db = getDb();
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, data.email))
        .limit(1);

      existedBefore = Boolean(existing);

      // ADR-0009: an account that already exists is never promoted silently.
      if (existing) {
        throw new Error(
          "An account with that email already exists. Promote it deliberately instead."
        );
      }

      await (await getAuth()).api.signUpEmail({
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

      // A read, not a generation. It costs nothing and proves the key works.
      const imageKey = getRuntimeEnv().OPENROUTER_API_KEY
        ? await verifyImageModelAccess().catch((error) => ({
            message: error instanceof Error ? error.message : "Unreachable",
            ok: false as const,
          }))
        : { message: "OPENROUTER_API_KEY is not set", ok: false as const };

      const webhookSecret = createAccessToken();

      await writeSetupValue(WEBHOOK_SECRET_KEY, { secret: webhookSecret });
      await writeSetupValue(SETUP_COMPLETED_KEY, {
        completedAt: new Date().toISOString(),
      });

      const { origin } = new URL(getRequest().url);

      return {
        imageKey,
        webhookUrl: `${origin}/api/webhooks/mayar/${webhookSecret}`,
      };
    } catch (error) {
      if (!existedBefore) {
        await deleteAccountByEmail(data.email).catch(() => undefined);
      }

      // Free the claim so the operator can correct the input and try again.
      await releaseSetupClaim().catch(() => undefined);
      throw error;
    }
  });
