import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { orders } from "@/db/schema";
import {
  listExpiredReservationOrderIds,
  releaseOrderReservation,
} from "@/lib/inventory";
import {
  createMayarVerificationPayload,
  getMayarTransaction,
  isMayarPaid,
} from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";

// Mayar allows 50 requests per minute for each API key. One provider call per
// order, well under the limit at a five minute schedule. See ADR-0010.
const MAX_ORDERS_PER_RUN = 40;

type ReconcileResult = {
  cancelled: number;
  examined: number;
  remaining: number;
  settled: number;
  skipped: number;
};

/**
 * Settles or cancels orders whose stock reservation has expired.
 *
 * An order is never cancelled on age alone. A buyer may have paid and closed
 * the tab, and without a registered webhook nothing else would notice. Mayar is
 * asked first, and only an order with no payment is cancelled. See ADR-0010.
 */
export async function reconcileExpiredOrders(
  now = new Date()
): Promise<ReconcileResult> {
  const expired = await listExpiredReservationOrderIds(now);
  const batch = expired.slice(0, MAX_ORDERS_PER_RUN);
  const result: ReconcileResult = {
    cancelled: 0,
    examined: batch.length,
    remaining: expired.length - batch.length,
    settled: 0,
    skipped: 0,
  };

  for (const orderId of batch) {
    // biome-ignore lint/performance/noAwaitInLoops: Provider calls are serial on purpose, to stay inside the Mayar rate limit.
    const settled = await settleIfPaid(orderId);

    if (settled === "paid") {
      result.settled += 1;
      continue;
    }

    if (settled === "unknown") {
      // The provider could not be reached. Leave the order alone and try again
      // on the next run, because cancelling a paid order is unrecoverable.
      result.skipped += 1;
      continue;
    }

    try {
      await releaseOrderReservation(orderId, "expired", now);
      result.cancelled += 1;
    } catch (error) {
      result.skipped += 1;
      console.error(`Failed to release reservation for ${orderId}`, error);
    }
  }

  return result;
}

async function settleIfPaid(
  orderId: string
): Promise<"paid" | "unknown" | "unpaid"> {
  const [order] = await getDb()
    .select({ transactionId: orders.mayarTransactionId })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order?.transactionId) {
    return "unpaid";
  }

  try {
    const transaction = await getMayarTransaction(order.transactionId);

    if (!isMayarPaid(transaction.status)) {
      return "unpaid";
    }

    await processMayarWebhook(
      createMayarVerificationPayload(
        `scheduled-reconcile-${orderId}-${transaction.id}`,
        transaction
      ),
      { verifiedTransactionId: transaction.id }
    );

    return "paid";
  } catch (error) {
    console.error(`Could not verify payment for order ${orderId}`, error);

    return "unknown";
  }
}
