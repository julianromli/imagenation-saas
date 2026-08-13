import { createServerFn } from "@tanstack/react-start";
import { getRequest, getRequestHeaders } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { getAuth, getFreshSession } from "@/lib/auth";
import { createAccessToken, hashToken } from "@/lib/ids";
import {
  readFinishedSteps,
  shouldShowOnboarding,
  withServerKnownSteps,
  writeFinishedSteps,
} from "@/lib/onboarding";
import { verifyImageModelAccess } from "@/lib/openrouter";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { setupGuideStepIds } from "@/lib/setup-guide";
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

/**
 * Whether this viewer is an administrator.
 *
 * The role decides who keeps seeing operator instructions, so the cookie cache
 * is bypassed for the same reason ADR-0014 bypasses it elsewhere. A failure
 * answers "no": the guide hiding is a smaller harm than a buyer reading it.
 */
async function isViewerAdmin() {
  try {
    const session = await getFreshSession(getRequestHeaders());

    return session?.user.role === "admin";
  } catch {
    return false;
  }
}

export const getSetupStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const complete = await isSetupComplete();
    const done = withServerKnownSteps(await readFinishedSteps(), complete);

    return {
      complete,
      onboarding: {
        done,
        show: shouldShowOnboarding({
          done,
          isAdmin: complete ? await isViewerAdmin() : false,
          setupComplete: complete,
        }),
      },
      tokenConfigured: Boolean(getRuntimeEnv().SETUP_TOKEN),
    };
  }
);

const markStepSchema = z.object({
  done: z.boolean(),
  id: z.enum(setupGuideStepIds as [string, ...string[]]),
});

/**
 * Ticks or unticks one step.
 *
 * Open to anybody only while setup is unfinished, which is the window where no
 * account exists to be an administrator. Afterwards it is the administrator's
 * checklist and nobody else's.
 */
export const markSetupStep = createServerFn({ method: "POST" })
  .validator(markStepSchema)
  .handler(async ({ data }) => {
    const complete = await isSetupComplete();

    if (complete && !(await isViewerAdmin())) {
      throw new Error("Forbidden");
    }

    const stored = await readFinishedSteps();
    const next = data.done
      ? [...stored, data.id]
      : stored.filter((id) => id !== data.id);

    await writeFinishedSteps(next);

    return withServerKnownSteps(next, complete);
  });

/**
 * Turns a fresh deploy into a usable app.
 *
 * A one-click deploy provisions the bindings and runs migrations, but nothing
 * creates the first administrator. Without this the app is live and nobody can
 * administer it. See ADR-0014.
 *
 * There is nothing to seed: credit packs live in `src/lib/pricing.ts` and
 * images are made on demand. What this does instead is check the image key,
 * because a wrong `OPENROUTER_API_KEY` should be found here and not by the
 * first paying user.
 */
export const runSetup = createServerFn({ method: "POST" })
  .validator((data: unknown) => setupSchema.parse(data))
  .handler(async ({ data }) => {
    // Consumed before the token is read, so a guess costs an attempt whatever
    // the outcome. Setup belongs to the app, not to a caller, so the key is
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
      throw new Error("Setup has already run for this app");
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
      // Free the claim so the operator can correct the input and try again.
      await releaseSetupClaim().catch(() => undefined);
      throw error;
    }
  });
