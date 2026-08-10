import { and, eq, isNull, lt, or, sql } from "drizzle-orm";

import { getDb, runBatch } from "@/db";
import { creditPurchases, users, webhookEvents } from "@/db/schema";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
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

/**
 * Finds the transaction a webhook is really about.
 *
 * Mayar sends no signature, so the payload is treated as a hint and nothing
 * more: the candidates come from our own pending purchases, and each one is
 * confirmed by reading the transaction back from Mayar. See ADR-0007.
 */
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
      amount: creditPurchases.amount,
      id: creditPurchases.id,
      mayarTransactionId: creditPurchases.mayarTransactionId,
    })
    .from(creditPurchases)
    .innerJoin(users, eq(users.id, creditPurchases.userId))
    .where(
      and(
        eq(creditPurchases.status, "pending"),
        eq(creditPurchases.amount, amount),
        sql`lower(${users.email}) = ${customerEmail}`
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
      transaction.amount === candidate.amount &&
      isMayarPaid(transaction.status) &&
      extraData.purchaseId === candidate.id
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

/**
 * Finds the event row an insert conflicted with.
 *
 * The event ID is asked for first and on its own. Combining both identifiers in
 * one OR with `limit(1)` let an unordered result hand back a different event
 * that merely shared the transaction.
 */
async function findExistingEvent(
  providerEventId: string,
  verifiedTransactionId?: string
) {
  const db = getDb();
  const [byEventId] = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "mayar"),
        eq(webhookEvents.providerEventId, providerEventId)
      )
    )
    .limit(1);

  if (byEventId || !verifiedTransactionId) {
    return byEventId;
  }

  const [byTransaction] = await db
    .select()
    .from(webhookEvents)
    .where(
      and(
        eq(webhookEvents.provider, "mayar"),
        eq(webhookEvents.transactionId, verifiedTransactionId)
      )
    )
    .limit(1);

  return byTransaction;
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
    event ?? (await findExistingEvent(eventId, verifiedTransactionId));

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
      "Transaction ID mapping could not be verified from the pending purchase data"
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
 * Turns a verified paid transaction into credits.
 *
 * The reads happen first, then every write goes into one batch. The webhook
 * lease already keeps a second worker out, and the unique index on
 * (ref_type, ref_id, reason) stops a replay from granting twice even if one
 * gets in. See ADR-0016.
 */
export async function settleVerifiedPayment(
  eventRecordId: string,
  verifiedTransactionId: string
) {
  const db = getDb();
  const transactionDetail = await getMayarTransaction(verifiedTransactionId);
  const extraData = objectValue(transactionDetail.extraData);
  const purchaseId =
    typeof extraData.purchaseId === "string" ? extraData.purchaseId : undefined;
  const now = new Date();
  const [purchase] = await db
    .select()
    .from(creditPurchases)
    .where(
      purchaseId
        ? eq(creditPurchases.id, purchaseId)
        : eq(creditPurchases.mayarTransactionId, transactionDetail.id)
    )
    .limit(1);

  if (!purchase) {
    throw new Error("Mayar transaction is not linked to a credit purchase");
  }

  if (transactionDetail.amount !== purchase.amount) {
    throw new Error("Mayar amount does not match the credit pack price");
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

    return { processed: false, reference: purchase.reference };
  }

  const completeEvent = db
    .update(webhookEvents)
    .set({
      completedAt: now,
      lockedUntil: null,
      processedAt: now,
      status: "completed",
      transactionId: transactionDetail.id,
      updatedAt: now,
    })
    .where(eq(webhookEvents.id, eventRecordId));

  if (purchase.creditedAt) {
    await runBatch([completeEvent]);

    return { processed: true, reference: purchase.reference };
  }

  await runBatch([
    ensureAccountStatement(purchase.userId),
    ...ledgerStatements({
      delta: purchase.credits,
      idrValue: purchase.amount,
      note: purchase.packId,
      reason: "purchase",
      refId: purchase.id,
      refType: "purchase",
      userId: purchase.userId,
    }),
    db
      .update(creditPurchases)
      .set({
        creditedAt: now,
        mayarTransactionId: transactionDetail.id,
        paidAt: now,
        status: "paid",
        updatedAt: now,
      })
      .where(eq(creditPurchases.id, purchase.id)),
    completeEvent,
  ]);

  return { processed: true, reference: purchase.reference };
}
