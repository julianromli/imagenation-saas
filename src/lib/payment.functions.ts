import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { withTransaction } from "@/db";
import {
  inventoryReservations,
  orderStatusHistory,
  orders,
  paymentAttempts,
  products,
  webhookEvents,
} from "@/db/schema";
import { createId } from "@/lib/ids";
import {
  getMayarTransaction,
  isMayarPaid,
  parseMayarWebhook,
} from "@/lib/mayar";

const CLAIM_LEASE_MS = 5 * 60 * 1000;

type ProcessOptions = {
  verifiedTransactionId?: string;
};

function objectValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

async function markWebhookFailure(id: string, error: unknown) {
  await withTransaction(async (transaction) => {
    await transaction
      .update(webhookEvents)
      .set({
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        lockedUntil: null,
        status: "failed",
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, id));
  });
}

async function markWebhookIgnored(id: string, reason: string) {
  await withTransaction(async (transaction) => {
    await transaction
      .update(webhookEvents)
      .set({
        errorMessage: reason,
        lockedUntil: null,
        processedAt: new Date(),
        status: "ignored",
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, id));
  });
}

function claimWebhookEvent(providerEventId: string, eventId: string) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + CLAIM_LEASE_MS);

  return withTransaction(async (transaction) => {
    const [claimed] = await transaction
      .update(webhookEvents)
      .set({
        attemptCount: sql`${webhookEvents.attemptCount} + 1`,
        errorMessage: null,
        lockedUntil,
        status: "processing",
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookEvents.id, eventId),
          or(
            eq(webhookEvents.status, "received"),
            eq(webhookEvents.status, "failed"),
            and(
              eq(webhookEvents.status, "processing"),
              or(
                isNull(webhookEvents.lockedUntil),
                lt(webhookEvents.lockedUntil, now)
              )
            )
          )
        )
      )
      .returning();

    if (claimed) {
      return { claimed, duplicate: false };
    }

    const [existing] = await transaction
      .select()
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.provider, "mayar"),
          eq(webhookEvents.providerEventId, providerEventId)
        )
      )
      .limit(1);

    return {
      claimed: existing,
      duplicate: true,
    };
  });
}

export async function processMayarWebhook(
  payload: unknown,
  options: ProcessOptions = {}
) {
  const webhook = parseMayarWebhook(payload);
  const eventId = webhook.id;
  const [event] = await withTransaction(async (transaction) =>
    transaction
      .insert(webhookEvents)
      .values({
        eventType: webhook.eventType,
        id: createId(),
        payload: webhook.payload,
        providerEventId: eventId,
        status: "received",
        transactionId: options.verifiedTransactionId ?? null,
      })
      .onConflictDoNothing()
      .returning()
  );

  const eventRecord =
    event ??
    (
      await withTransaction(async (transaction) =>
        transaction
          .select()
          .from(webhookEvents)
          .where(
            and(
              eq(webhookEvents.provider, "mayar"),
              eq(webhookEvents.providerEventId, eventId)
            )
          )
          .limit(1)
      )
    )[0];

  if (!eventRecord) {
    throw new Error("Unable to persist Mayar webhook event");
  }

  if (eventRecord.status === "completed") {
    return { duplicate: true, processed: true };
  }

  if (webhook.eventType !== "payment.received") {
    await markWebhookIgnored(
      eventRecord.id,
      "Event type is not a payment confirmation"
    );

    return { duplicate: !event, processed: false };
  }

  if (!options.verifiedTransactionId) {
    await markWebhookIgnored(
      eventRecord.id,
      "Transaction ID mapping is not verified from an actual Mayar payload"
    );

    return {
      duplicate: !event,
      processed: false,
      reason: "unverified_transaction_id_mapping",
    };
  }

  const claim = await claimWebhookEvent(eventId, eventRecord.id);

  if (!claim.claimed || claim.duplicate) {
    return { duplicate: true, processed: false };
  }

  try {
    const transactionDetail = await getMayarTransaction(
      options.verifiedTransactionId
    );
    const extraData = objectValue(transactionDetail.extraData);
    const orderId =
      typeof extraData.orderId === "string" ? extraData.orderId : undefined;

    const result = await withTransaction(async (transaction) => {
      const [order] = await transaction
        .select()
        .from(orders)
        .where(
          orderId
            ? eq(orders.id, orderId)
            : eq(orders.mayarTransactionId, transactionDetail.id)
        )
        .limit(1);

      if (!order) {
        throw new Error("Mayar transaction is not linked to a local order");
      }

      if (transactionDetail.amount !== order.total) {
        throw new Error("Mayar amount does not match the local order total");
      }

      if (!isMayarPaid(transactionDetail.status)) {
        await transaction
          .update(webhookEvents)
          .set({
            lockedUntil: null,
            processedAt: new Date(),
            status: "ignored",
            updatedAt: new Date(),
          })
          .where(eq(webhookEvents.id, eventRecord.id));

        return { orderNumber: order.orderNumber, processed: false };
      }

      if (order.paymentStatus === "paid") {
        await transaction
          .update(webhookEvents)
          .set({
            completedAt: new Date(),
            lockedUntil: null,
            processedAt: new Date(),
            status: "completed",
            updatedAt: new Date(),
          })
          .where(eq(webhookEvents.id, eventRecord.id));

        return { orderNumber: order.orderNumber, processed: true };
      }

      const reservations = await transaction
        .select()
        .from(inventoryReservations)
        .where(
          and(
            eq(inventoryReservations.orderId, order.id),
            eq(inventoryReservations.status, "reserved")
          )
        );

      if (reservations.length === 0) {
        throw new Error(
          "Payment arrived after its inventory reservation expired; reconcile manually"
        );
      }

      for (const reservation of reservations) {
        // biome-ignore lint/performance/noAwaitInLoops: Reservation conversion must remain serial inside the payment transaction.
        await transaction
          .update(products)
          .set({
            reservedStock: sql`${products.reservedStock} - ${reservation.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, reservation.productId));
        await transaction
          .update(inventoryReservations)
          .set({
            convertedAt: new Date(),
            status: "converted",
            updatedAt: new Date(),
          })
          .where(eq(inventoryReservations.id, reservation.id));
      }

      await transaction
        .update(orders)
        .set({
          mayarTransactionId: transactionDetail.id,
          paidAt: new Date(),
          paymentStatus: "paid",
          status: "paid",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await transaction
        .update(paymentAttempts)
        .set({
          status: "paid",
          transactionId: transactionDetail.id,
          updatedAt: new Date(),
        })
        .where(eq(paymentAttempts.orderId, order.id));
      await transaction.insert(orderStatusHistory).values({
        actorUserId: null,
        fromStatus: order.status,
        id: createId(),
        note: "Payment confirmed by Mayar transaction lookup",
        orderId: order.id,
        toStatus: "paid",
      });
      await transaction
        .update(webhookEvents)
        .set({
          completedAt: new Date(),
          lockedUntil: null,
          processedAt: new Date(),
          status: "completed",
          transactionId: transactionDetail.id,
          updatedAt: new Date(),
        })
        .where(eq(webhookEvents.id, eventRecord.id));

      return { orderNumber: order.orderNumber, processed: true };
    });

    return { duplicate: false, ...result };
  } catch (error) {
    await markWebhookFailure(eventRecord.id, error);
    throw error;
  }
}
