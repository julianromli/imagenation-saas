import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { type BatchStatement, getDb, runBatch } from "@/db";
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
  type MayarWebhook,
  parseMayarWebhook,
} from "@/lib/mayar";

const CLAIM_LEASE_MS = 5 * 60 * 1000;

type ProcessOptions = {
  verifiedTransactionId?: string;
};

type ClaimOptions = {
  allowIgnored?: boolean;
};

function objectValue(value: unknown) {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

async function findVerifiedTransactionForWebhook(webhook: MayarWebhook) {
  const data = objectValue(webhook.payload.data);
  const customerEmail =
    typeof data.customerEmail === "string"
      ? data.customerEmail.trim().toLowerCase()
      : null;
  const amount = typeof data.amount === "number" ? data.amount : null;

  if (!customerEmail || amount === null) {
    return null;
  }

  const candidates = await getDb()
    .select({
      id: orders.id,
      mayarTransactionId: orders.mayarTransactionId,
      total: orders.total,
    })
    .from(orders)
    .where(
      and(
        eq(orders.paymentStatus, "pending"),
        eq(orders.status, "pending_payment"),
        eq(orders.total, amount),
        sql`lower(${orders.guestEmail}) = ${customerEmail}`
      )
    )
    .limit(20);

  for (const candidate of candidates) {
    if (!candidate.mayarTransactionId) {
      continue;
    }

    // biome-ignore lint/performance/noAwaitInLoops: Stop after the first verified candidate to limit provider calls.
    const transaction = await getMayarTransaction(candidate.mayarTransactionId);
    const extraData = objectValue(transaction.extraData);

    if (
      transaction.amount === candidate.total &&
      isMayarPaid(transaction.status) &&
      extraData.orderId === candidate.id
    ) {
      return transaction;
    }
  }

  return null;
}

function markWebhookFailure(id: string, error: unknown) {
  return getDb()
    .update(webhookEvents)
    .set({
      errorMessage: error instanceof Error ? error.message : "Unknown error",
      lockedUntil: null,
      status: "failed",
      updatedAt: new Date(),
    })
    .where(eq(webhookEvents.id, id));
}

function markWebhookIgnored(id: string, reason: string) {
  return getDb()
    .update(webhookEvents)
    .set({
      errorMessage: reason,
      lockedUntil: null,
      processedAt: new Date(),
      status: "ignored",
      updatedAt: new Date(),
    })
    .where(eq(webhookEvents.id, id));
}

/**
 * Takes the lease on a webhook event.
 *
 * The update is a compare-and-swap and is atomic on its own, so it needs no
 * surrounding transaction: either this call moved the row into `processing` or
 * somebody else already holds it.
 */
async function claimWebhookEvent(
  providerEventId: string,
  eventId: string,
  options: ClaimOptions = {}
) {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + CLAIM_LEASE_MS);
  const db = getDb();
  const claimableStatuses = [
    eq(webhookEvents.status, "received"),
    eq(webhookEvents.status, "failed"),
    ...(options.allowIgnored ? [eq(webhookEvents.status, "ignored")] : []),
    and(
      eq(webhookEvents.status, "processing"),
      or(isNull(webhookEvents.lockedUntil), lt(webhookEvents.lockedUntil, now))
    ),
  ];
  const [claimed] = await db
    .update(webhookEvents)
    .set({
      attemptCount: sql`${webhookEvents.attemptCount} + 1`,
      errorMessage: null,
      lockedUntil,
      status: "processing",
      updatedAt: now,
    })
    .where(and(eq(webhookEvents.id, eventId), or(...claimableStatuses)))
    .returning();

  if (claimed) {
    return { claimed, duplicate: false };
  }

  const [existing] = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "mayar"),
        eq(webhookEvents.providerEventId, providerEventId)
      )
    )
    .limit(1);

  return { claimed: existing, duplicate: true };
}

export async function processMayarWebhook(
  payload: unknown,
  options: ProcessOptions = {}
) {
  const webhook = parseMayarWebhook(payload);
  const eventId = webhook.id;
  const db = getDb();
  const verifiedTransactionId =
    options.verifiedTransactionId ??
    (webhook.eventType === "payment.received"
      ? (await findVerifiedTransactionForWebhook(webhook))?.id
      : undefined);
  const [event] = await db
    .insert(webhookEvents)
    .values({
      eventType: webhook.eventType,
      id: createId(),
      payload: webhook.payload,
      providerEventId: eventId,
      status: "received",
      transactionId: verifiedTransactionId ?? null,
    })
    .onConflictDoNothing()
    .returning();
  const eventRecord =
    event ??
    (
      await db
        .select()
        .from(webhookEvents)
        .where(
          verifiedTransactionId
            ? and(
                eq(webhookEvents.provider, "mayar"),
                or(
                  eq(webhookEvents.providerEventId, eventId),
                  eq(webhookEvents.transactionId, verifiedTransactionId)
                )
              )
            : and(
                eq(webhookEvents.provider, "mayar"),
                eq(webhookEvents.providerEventId, eventId)
              )
        )
        .limit(1)
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

  if (!verifiedTransactionId) {
    await markWebhookIgnored(
      eventRecord.id,
      "Transaction ID mapping could not be verified from the pending order data"
    );

    return {
      duplicate: !event,
      processed: false,
      reason: "unverified_transaction_id_mapping",
    };
  }

  if (eventRecord.status === "ignored") {
    await db
      .update(webhookEvents)
      .set({
        eventType: webhook.eventType,
        payload: webhook.payload,
        updatedAt: new Date(),
      })
      .where(eq(webhookEvents.id, eventRecord.id));
  }

  const claim = await claimWebhookEvent(
    eventRecord.providerEventId,
    eventRecord.id,
    { allowIgnored: Boolean(verifiedTransactionId) }
  );

  if (!claim.claimed || claim.duplicate) {
    return { duplicate: true, processed: false };
  }

  try {
    return {
      duplicate: false,
      ...(await settleVerifiedPayment(eventRecord.id, verifiedTransactionId)),
    };
  } catch (error) {
    await markWebhookFailure(eventRecord.id, error);
    throw error;
  }
}

/**
 * Turns a verified paid transaction into a paid order.
 *
 * The reads happen first, then every write goes into one batch. The webhook
 * lease already keeps a second worker out, and the `reserved_stock` check
 * constraint stops a double conversion from corrupting stock if one gets in.
 */
async function settleVerifiedPayment(
  eventRecordId: string,
  verifiedTransactionId: string
) {
  const db = getDb();
  const transactionDetail = await getMayarTransaction(verifiedTransactionId);
  const extraData = objectValue(transactionDetail.extraData);
  const orderId =
    typeof extraData.orderId === "string" ? extraData.orderId : undefined;
  const now = new Date();
  const [order] = await db
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
    await db
      .update(webhookEvents)
      .set({
        lockedUntil: null,
        processedAt: now,
        status: "ignored",
        updatedAt: now,
      })
      .where(eq(webhookEvents.id, eventRecordId));

    return { orderNumber: order.orderNumber, processed: false };
  }

  if (order.paymentStatus === "paid") {
    await db
      .update(webhookEvents)
      .set({
        completedAt: now,
        lockedUntil: null,
        processedAt: now,
        status: "completed",
        updatedAt: now,
      })
      .where(eq(webhookEvents.id, eventRecordId));

    return { orderNumber: order.orderNumber, processed: true };
  }

  const reservations = await db
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

  const statements: BatchStatement[] = [];

  for (const reservation of reservations) {
    statements.push(
      db
        .update(products)
        .set({
          reservedStock: sql`${products.reservedStock} - ${reservation.quantity}`,
          updatedAt: now,
        })
        .where(eq(products.id, reservation.productId)),
      db
        .update(inventoryReservations)
        .set({
          convertedAt: now,
          status: "converted",
          updatedAt: now,
        })
        .where(eq(inventoryReservations.id, reservation.id))
    );
  }

  statements.push(
    db
      .update(orders)
      .set({
        mayarTransactionId: transactionDetail.id,
        paidAt: now,
        paymentStatus: "paid",
        status: "paid",
        updatedAt: now,
      })
      .where(eq(orders.id, order.id)),
    db
      .update(paymentAttempts)
      .set({
        status: "paid",
        transactionId: transactionDetail.id,
        updatedAt: now,
      })
      .where(eq(paymentAttempts.orderId, order.id)),
    db.insert(orderStatusHistory).values({
      actorUserId: null,
      fromStatus: order.status,
      id: createId(),
      note: "Payment confirmed by Mayar transaction lookup",
      orderId: order.id,
      toStatus: "paid",
    }),
    db
      .update(webhookEvents)
      .set({
        completedAt: now,
        lockedUntil: null,
        processedAt: now,
        status: "completed",
        transactionId: transactionDetail.id,
        updatedAt: now,
      })
      .where(eq(webhookEvents.id, eventRecordId))
  );

  await runBatch(statements);

  return { orderNumber: order.orderNumber, processed: true };
}
