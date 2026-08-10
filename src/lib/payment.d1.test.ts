import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, runBatch } from "@/db";
import { creditPurchases, users } from "@/db/schema";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
import { createId, createPurchaseReference } from "@/lib/ids";

// Mayar is the only thing stubbed. The webhook lease, the ledger, and the
// unique index that makes a replay harmless all run for real.
const getMayarTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mayar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mayar")>();

  return { ...actual, getMayarTransaction };
});

const { processMayarWebhook } = await import("@/lib/payment.functions");

const PACK_AMOUNT = 35_000;
const PACK_CREDITS = 20;

async function createPendingPurchase() {
  const userId = createId();
  const email = `${userId}@example.test`;
  const purchaseId = createId();
  const transactionId = `tx-${purchaseId}`;

  await getDb().insert(users).values({ email, id: userId, name: "Test buyer" });

  await runBatch([
    ensureAccountStatement(userId),
    ...ledgerStatements({
      delta: 0,
      reason: "grant",
      refId: userId,
      refType: "signup",
      userId,
    }),
  ]);

  await getDb().insert(creditPurchases).values({
    amount: PACK_AMOUNT,
    credits: PACK_CREDITS,
    id: purchaseId,
    mayarTransactionId: transactionId,
    packId: "starter",
    reference: createPurchaseReference(),
    status: "pending",
    userId,
  });

  getMayarTransaction.mockResolvedValue({
    amount: PACK_AMOUNT,
    extraData: { purchaseId },
    id: transactionId,
    status: "paid",
  });

  return { email, purchaseId, transactionId, userId };
}

function webhookPayload(email: string, eventId: string, transactionId: string) {
  return {
    data: {
      amount: PACK_AMOUNT,
      customerEmail: email,
      id: eventId,
      transactionId,
      transactionStatus: "paid",
    },
    event: "payment.received",
  };
}

function readBalance(userId: string) {
  return getDb()
    .query.creditAccounts.findFirst({
      where: (row, { eq: is }) => is(row.userId, userId),
    })
    .then((row) => row?.balance ?? 0);
}

describe("a paid Mayar webhook", () => {
  beforeEach(() => {
    getMayarTransaction.mockReset();
  });

  it("grants the credits and marks the purchase paid", async () => {
    const { email, purchaseId, transactionId, userId } =
      await createPendingPurchase();

    const result = await processMayarWebhook(
      webhookPayload(email, "evt-1", transactionId)
    );

    expect(result.processed).toBe(true);
    expect(await readBalance(userId)).toBe(PACK_CREDITS);

    const purchase = await getDb().query.creditPurchases.findFirst({
      where: eq(creditPurchases.id, purchaseId),
    });

    expect(purchase?.status).toBe("paid");
    expect(purchase?.creditedAt).not.toBeNull();
  });

  it("grants nothing extra when the same event is delivered again", async () => {
    const { email, transactionId, userId } = await createPendingPurchase();

    await processMayarWebhook(webhookPayload(email, "evt-2", transactionId));
    await processMayarWebhook(webhookPayload(email, "evt-2", transactionId));

    expect(await readBalance(userId)).toBe(PACK_CREDITS);
  });

  it("grants nothing extra when Mayar sends a fresh event for a paid purchase", async () => {
    const { email, transactionId, userId } = await createPendingPurchase();

    await processMayarWebhook(webhookPayload(email, "evt-3", transactionId));
    // A different event id, same transaction. The purchase is already
    // credited, so the second one must settle to nothing.
    await processMayarWebhook(webhookPayload(email, "evt-4", transactionId));

    expect(await readBalance(userId)).toBe(PACK_CREDITS);
  });

  it("ignores an event that is not a payment confirmation", async () => {
    const { email, transactionId, userId } = await createPendingPurchase();

    const result = await processMayarWebhook({
      ...webhookPayload(email, "evt-5", transactionId),
      event: "shipping.updated",
    });

    expect(result.processed).toBe(false);
    expect(await readBalance(userId)).toBe(0);
  });

  it("ignores a payload it cannot tie to a pending purchase", async () => {
    const { transactionId, userId } = await createPendingPurchase();

    const result = await processMayarWebhook(
      webhookPayload("stranger@example.test", "evt-6", transactionId)
    );

    expect(result.processed).toBe(false);
    expect(await readBalance(userId)).toBe(0);
  });
});
