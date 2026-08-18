import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { creditPurchases, users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { RateLimitError } from "@/lib/errors";
import { isMayarRateLimit } from "@/lib/mayar";
import { MAYAR_PAYMENT_METHODS } from "@/lib/payment-methods";
import type { PurchaseView } from "@/lib/purchase";
import {
  createPurchaseInvoice,
  findReusablePurchase,
  packForPurchase,
  pollPurchaseState,
  readSavedMobile,
  reconcilePurchase,
  toPurchaseView,
} from "@/lib/purchase";
import { consumeRateLimit } from "@/lib/rate-limit";

const startPurchaseSchema = z.object({
  /** Omitted once the account already carries a number. */
  mobile: z.string().trim().min(8).max(24).optional(),
  packId: z.string().min(1).max(40),
  paymentMethod: z.enum(MAYAR_PAYMENT_METHODS),
});

const pollPurchaseSchema = z.object({
  reference: z.string().min(1).max(64),
});

async function requireUser() {
  const session = await (await getAuth()).api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session.user;
}

/** Lets the checkout form prefill, and skip the question for repeat buyers. */
export const getSavedMobile = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();

    return readSavedMobile(user.id);
  }
);

/**
 * Starts a purchase and returns everything the checkout needs to render.
 *
 * A pending invoice for the same pack and the same channel is reused rather
 * than replaced. Mayar refuses a second create for one customer at one amount
 * for a minute, so an impatient second click has to land on the first invoice.
 * Changing channel inside that minute is the one case that cannot be served,
 * and it is reported as such. See ADR-0021.
 */
export const startPurchase = createServerFn({ method: "POST" })
  .validator(startPurchaseSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await consumeRateLimit("CHECKOUT_LIMITER", user.id);

    const pack = packForPurchase(data.packId);
    const existing = await findReusablePurchase(
      user.id,
      pack.id,
      data.paymentMethod
    );

    if (existing?.paymentUrl) {
      return toPurchaseView(existing);
    }

    // Mayar requires a mobile number on every invoice. It is asked once, kept
    // on the account, and reused for every later purchase.
    const savedMobile = await readSavedMobile(user.id);
    const mobile = data.mobile ?? savedMobile;

    if (!mobile) {
      throw new Error("A mobile number is required");
    }

    if (mobile !== savedMobile) {
      await getDb()
        .update(users)
        .set({ mobile, updatedAt: new Date() })
        .where(eq(users.id, user.id));
    }

    try {
      return await createPurchaseInvoice({
        mobile,
        origin: new URL(getRequestUrl()).origin,
        pack,
        paymentMethod: data.paymentMethod,
        user: { email: user.email, id: user.id, name: user.name },
      });
    } catch (error) {
      if (isMayarRateLimit(error) && error.duplicate) {
        throw new Error(
          "Mayar needs a minute before it will issue another payment for this pack. Wait, then try again.",
          { cause: error }
        );
      }

      if (isMayarRateLimit(error)) {
        throw new RateLimitError("Mayar is busy. Try again in a minute.", {
          cause: error,
        });
      }

      throw error;
    }
  });

/**
 * Answers the checkout's poll.
 *
 * Scoped to the caller's own purchases: without that, a stranger could read
 * somebody's payment state and spend our Mayar request budget doing it. The
 * reply carries `nextPollMs`, so the cadence is a server-side decision.
 */
export const pollPurchase = createServerFn({ method: "POST" })
  .validator(pollPurchaseSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await consumeRateLimit("POLL_LIMITER", user.id);

    return pollPurchaseState(user.id, data.reference);
  });

export const listPurchases = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    const rows = await getDb().query.creditPurchases.findMany({
      limit: 30,
      orderBy: desc(creditPurchases.createdAt),
      where: eq(creditPurchases.userId, user.id),
    });

    const views: PurchaseView[] = [];

    for (const row of rows) {
      // A pending row with no payment URL is a create that failed after the
      // row was written. There is nothing to pay, so it is not shown.
      if (row.status === "pending" && !row.paymentUrl) {
        continue;
      }

      views.push(toPurchaseView(row));
    }

    return views;
  }
);

export const refreshPurchase = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const user = await requireUser();

    await consumeRateLimit("CHECKOUT_LIMITER", user.id);

    const purchase = await getDb().query.creditPurchases.findFirst({
      where: and(
        eq(creditPurchases.id, id),
        eq(creditPurchases.userId, user.id)
      ),
    });

    if (!purchase) {
      throw new Error("Unknown purchase");
    }

    // A person pressing the button has earned a read, whatever the ladder says.
    return reconcilePurchase(purchase.id, { minAgeMs: 0 });
  });
