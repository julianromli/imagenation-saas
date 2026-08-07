import { and, eq, lt, sql } from "drizzle-orm";

import { type BatchStatement, getDb, runBatch } from "@/db";
import { inventoryReservations, orders, products } from "@/db/schema";

type ReleaseReason = "expired" | "payment_creation_failed";

/**
 * Order IDs that still hold reserved stock past their expiry.
 *
 * The scheduled job asks for this list, checks each order against Mayar, and
 * only then releases the ones that were never paid. See ADR-0010.
 */
export async function listExpiredReservationOrderIds(now = new Date()) {
  const rows = await getDb()
    .selectDistinct({ orderId: inventoryReservations.orderId })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.status, "reserved"),
        lt(inventoryReservations.expiresAt, now)
      )
    );

  return rows.map((row) => row.orderId);
}

/**
 * Returns stock held by one order and marks its reservations closed.
 *
 * Every statement runs in a single batch. If the same reservation is released
 * twice, `reserved_stock` would fall below zero, the check constraint fails, and
 * the batch is rolled back rather than leaving corrupted stock behind.
 */
export async function releaseOrderReservation(
  orderId: string,
  reason: ReleaseReason = "expired",
  now = new Date()
) {
  const reservations = await getDb()
    .select({
      id: inventoryReservations.id,
      productId: inventoryReservations.productId,
      quantity: inventoryReservations.quantity,
    })
    .from(inventoryReservations)
    .where(
      and(
        eq(inventoryReservations.orderId, orderId),
        eq(inventoryReservations.status, "reserved")
      )
    );

  if (reservations.length === 0) {
    return 0;
  }

  const db = getDb();
  const statements: BatchStatement[] = [];

  for (const reservation of reservations) {
    statements.push(
      db
        .update(products)
        .set({
          availableStock: sql`${products.availableStock} + ${reservation.quantity}`,
          reservedStock: sql`${products.reservedStock} - ${reservation.quantity}`,
          updatedAt: now,
        })
        .where(eq(products.id, reservation.productId)),
      db
        .update(inventoryReservations)
        .set({
          releasedAt: now,
          status: reason === "payment_creation_failed" ? "released" : "expired",
          updatedAt: now,
        })
        .where(eq(inventoryReservations.id, reservation.id))
    );
  }

  statements.push(
    db
      .update(orders)
      .set({
        paymentStatus: "expired",
        status: "cancelled",
        updatedAt: now,
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")))
  );

  await runBatch(statements);

  return reservations.length;
}

/**
 * Releases every expired reservation without asking the payment provider.
 *
 * The scheduled job must not call this directly, because an order may have been
 * paid while nobody was watching. See ADR-0010.
 */
export async function releaseExpiredReservations(now = new Date()) {
  const orderIds = await listExpiredReservationOrderIds(now);
  let released = 0;

  for (const orderId of orderIds) {
    // biome-ignore lint/performance/noAwaitInLoops: Each order is its own atomic batch, so one failure cannot take the others down.
    released += await releaseOrderReservation(orderId, "expired", now);
  }

  return released;
}
