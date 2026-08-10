import { env } from "cloudflare:workers";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { creditPurchases, generations, webhookEvents } from "@/db/schema";
import { abandonGeneration } from "@/lib/generation";
import {
  GENERATION_TIMEOUT_MINUTES,
  IMAGE_RETENTION_DAYS,
} from "@/lib/pricing";
import { reconcilePurchase } from "@/lib/purchase.functions";

// Mayar allows 50 requests per minute for each API key. One provider call per
// purchase, well under the limit at a five minute schedule.
const MAX_PURCHASES_PER_RUN = 30;

/** R2 deletes are cheap, but a run should still end. */
const MAX_IMAGES_PER_RUN = 200;

// Webhook payloads are raw provider data and hold customer details. They are
// kept long enough to investigate a payment dispute, then dropped.
const WEBHOOK_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Refunds generations that never came back.
 *
 * The work runs under `waitUntil` and normally settles itself. This is for the
 * cases it cannot: an isolate evicted mid-flight, or a provider that accepted
 * the request and never answered. Credits taken for an image nobody received
 * always come back. See ADR-0017.
 */
export async function refundStuckGenerations(now = new Date()) {
  const cutoff = new Date(now.getTime() - GENERATION_TIMEOUT_MINUTES * 60_000);
  const stuck = await getDb().query.generations.findMany({
    limit: 50,
    where: and(
      eq(generations.status, "pending"),
      lt(generations.createdAt, cutoff)
    ),
  });

  for (const generation of stuck) {
    // biome-ignore lint/performance/noAwaitInLoops: Each refund is its own batch, and a failure must not take the rest of the run with it.
    await abandonGeneration(generation).catch((error) => {
      console.error(`Could not refund generation ${generation.id}`, error);
    });
  }

  return stuck.length;
}

/**
 * Settles purchases whose webhook never arrived.
 *
 * Registering the webhook is optional, so this is the only thing that credits
 * an account on a store that skipped it. It calls the same settlement path as
 * the webhook, which is what makes running both safe. See ADR-0007.
 */
export async function reconcilePendingPurchases(now = new Date()) {
  const pending = await getDb().query.creditPurchases.findMany({
    limit: MAX_PURCHASES_PER_RUN,
    where: and(
      eq(creditPurchases.status, "pending"),
      isNull(creditPurchases.creditedAt)
    ),
  });

  let settled = 0;
  let expired = 0;

  for (const purchase of pending) {
    // biome-ignore lint/performance/noAwaitInLoops: One provider call at a time keeps this inside Mayar's rate limit.
    const result = await reconcilePurchase(purchase.id).catch((error) => {
      console.error(
        `Could not reconcile purchase ${purchase.reference}`,
        error
      );

      return { settled: false };
    });

    if (result.settled) {
      settled += 1;
      continue;
    }

    // An unpaid invoice past its own expiry is closed, so it stops being
    // examined on every run from now on.
    if (purchase.expiresAt && purchase.expiresAt < now) {
      await getDb()
        .update(creditPurchases)
        .set({ status: "expired", updatedAt: now })
        .where(eq(creditPurchases.id, purchase.id));

      expired += 1;
    }
  }

  return { examined: pending.length, expired, settled };
}

/**
 * Deletes generated images past their retention window.
 *
 * A shared image is skipped: a link handed to somebody should not rot. The row
 * stays either way, so history keeps the prompt and what it cost. See ADR-0020.
 */
export async function sweepExpiredImages(now = new Date()) {
  const cutoff = new Date(now.getTime() - IMAGE_RETENTION_DAYS * DAY_MS);
  const expired = await getDb().query.generations.findMany({
    limit: MAX_IMAGES_PER_RUN,
    where: and(
      eq(generations.status, "succeeded"),
      isNull(generations.shareToken),
      lt(generations.createdAt, cutoff)
    ),
  });

  let removed = 0;

  for (const generation of expired) {
    if (!generation.objectKey) {
      continue;
    }

    try {
      // biome-ignore lint/performance/noAwaitInLoops: The object has to be gone before the key is cleared, or the key is lost and the object leaks.
      await env.BUCKET.delete(generation.objectKey);
      await getDb()
        .update(generations)
        .set({ mediaType: null, objectKey: null, updatedAt: now })
        .where(eq(generations.id, generation.id));

      removed += 1;
    } catch (error) {
      console.error(`Could not delete image ${generation.objectKey}`, error);
    }
  }

  return removed;
}

export async function pruneSettledWebhookEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - WEBHOOK_RETENTION_DAYS * DAY_MS);
  const deleted = await getDb()
    .delete(webhookEvents)
    .where(
      and(
        inArray(webhookEvents.status, ["completed", "ignored"]),
        lt(webhookEvents.updatedAt, cutoff)
      )
    )
    .returning({ id: webhookEvents.id });

  return deleted.length;
}
