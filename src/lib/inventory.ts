import { and, eq, lt, sql } from "drizzle-orm";

import { withTransaction } from "@/db";
import { inventoryReservations, orders, products } from "@/db/schema";

export function releaseExpiredReservations(now = new Date()) {
  return withTransaction(async (transaction) => {
    const reservations = await transaction
      .select()
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.status, "reserved"),
          lt(inventoryReservations.expiresAt, now)
        )
      );

    let released = 0;

    for (const reservation of reservations) {
      // biome-ignore lint/performance/noAwaitInLoops: Inventory updates must stay sequential inside the transaction.
      await transaction
        .update(products)
        .set({
          availableStock: sql`${products.availableStock} + ${reservation.quantity}`,
          reservedStock: sql`${products.reservedStock} - ${reservation.quantity}`,
          updatedAt: now,
        })
        .where(eq(products.id, reservation.productId));
      await transaction
        .update(inventoryReservations)
        .set({
          releasedAt: now,
          status: "expired",
          updatedAt: now,
        })
        .where(
          and(
            eq(inventoryReservations.id, reservation.id),
            eq(inventoryReservations.status, "reserved")
          )
        );
      await transaction
        .update(orders)
        .set({
          paymentStatus: "expired",
          status: "cancelled",
          updatedAt: now,
        })
        .where(
          and(
            eq(orders.id, reservation.orderId),
            eq(orders.status, "pending_payment")
          )
        );

      released += 1;
    }

    return released;
  });
}

export function releaseOrderReservation(orderId: string, reason = "expired") {
  return withTransaction(async (transaction) => {
    const reservations = await transaction
      .select()
      .from(inventoryReservations)
      .where(
        and(
          eq(inventoryReservations.orderId, orderId),
          eq(inventoryReservations.status, "reserved")
        )
      );

    for (const reservation of reservations) {
      // biome-ignore lint/performance/noAwaitInLoops: Inventory updates must stay sequential inside the transaction.
      await transaction
        .update(products)
        .set({
          availableStock: sql`${products.availableStock} + ${reservation.quantity}`,
          reservedStock: sql`${products.reservedStock} - ${reservation.quantity}`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, reservation.productId));
      await transaction
        .update(inventoryReservations)
        .set({
          releasedAt: new Date(),
          status: reason === "payment_creation_failed" ? "released" : "expired",
          updatedAt: new Date(),
        })
        .where(eq(inventoryReservations.id, reservation.id));
    }

    await transaction
      .update(orders)
      .set({
        paymentStatus: "expired",
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(and(eq(orders.id, orderId), eq(orders.status, "pending_payment")));
  });
}
