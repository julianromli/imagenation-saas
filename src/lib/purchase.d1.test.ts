import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getDb, runBatch } from "@/db";
import { creditPurchases, users } from "@/db/schema";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
import { createId, createPurchaseReference } from "@/lib/ids";

// Mayar is the only thing stubbed. The claim, the webhook lease, the ledger,
// and the unique index that makes a replay harmless all run for real.
const getMayarTransaction = vi.hoisted(() => vi.fn());

vi.mock("@/lib/mayar", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/mayar")>();

  return { ...actual, getMayarTransaction };
});

const { claimPurchaseRead, pollPurchaseState, reconcilePurchase } =
  await import("@/lib/purchase");

const PACK_AMOUNT = 35_000;
const PACK_CREDITS = 20;

async function createPendingPurchase({ paid = true } = {}) {
  const userId = createId();
  const purchaseId = createId();
  const transactionId = `tx-${purchaseId}`;
  const reference = createPurchaseReference();

  await getDb()
    .insert(users)
    .values({
      email: `${userId}@example.test`,
      id: userId,
      name: "Test buyer",
    });

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
    paymentMethod: "qris",
    paymentUrl: "https://store.example.com/invoices/abc",
    reference,
    status: "pending",
    userId,
  });

  getMayarTransaction.mockResolvedValue({
    amount: PACK_AMOUNT,
    extraData: { purchaseId },
    id: transactionId,
    status: paid ? "paid" : "created",
  });

  return { purchaseId, reference, transactionId, userId };
}

function readBalance(userId: string) {
  return getDb()
    .query.creditAccounts.findFirst({
      where: (row, { eq: is }) => is(row.userId, userId),
    })
    .then((row) => row?.balance ?? 0);
}

function backdateLastCheck(purchaseId: string, msAgo: number) {
  return getDb()
    .update(creditPurchases)
    .set({ lastCheckedAt: new Date(Date.now() - msAgo) })
    .where(eq(creditPurchases.id, purchaseId));
}

describe("claiming the right to read a purchase back", () => {
  beforeEach(() => {
    getMayarTransaction.mockReset();
  });

  it("lets exactly one of several concurrent callers through", async () => {
    const { purchaseId } = await createPendingPurchase();

    const claims = await Promise.all(
      Array.from({ length: 5 }, () => claimPurchaseRead(purchaseId, 30_000))
    );

    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("lets a caller through again once the gap has passed", async () => {
    const { purchaseId } = await createPendingPurchase();

    expect(await claimPurchaseRead(purchaseId, 30_000)).toBe(true);
    expect(await claimPurchaseRead(purchaseId, 30_000)).toBe(false);

    await backdateLastCheck(purchaseId, 60_000);

    expect(await claimPurchaseRead(purchaseId, 30_000)).toBe(true);
  });

  it("refuses a purchase that is already credited", async () => {
    const { purchaseId } = await createPendingPurchase();

    await getDb()
      .update(creditPurchases)
      .set({ creditedAt: new Date(), status: "paid" })
      .where(eq(creditPurchases.id, purchaseId));

    expect(await claimPurchaseRead(purchaseId, 0)).toBe(false);
  });
});

describe("polling a purchase", () => {
  beforeEach(() => {
    getMayarTransaction.mockReset();
  });

  it("grants the credits once, however many polls race", async () => {
    const { reference, userId } = await createPendingPurchase();

    const views = await Promise.all(
      Array.from({ length: 3 }, () => pollPurchaseState(userId, reference))
    );

    expect(await readBalance(userId)).toBe(PACK_CREDITS);
    expect(views.some((view) => view.status === "paid")).toBe(true);
    // The three polls share one read of the transaction, and settlement reuses
    // the transaction it was handed rather than reading it again.
    expect(getMayarTransaction).toHaveBeenCalledTimes(1);
  });

  it("reads the row and nothing else while the gap is open", async () => {
    const { reference, userId } = await createPendingPurchase({ paid: false });

    await pollPurchaseState(userId, reference);
    getMayarTransaction.mockClear();

    const view = await pollPurchaseState(userId, reference);

    expect(getMayarTransaction).not.toHaveBeenCalled();
    expect(view.status).toBe("pending");
    expect(view.nextPollMs).toBeGreaterThan(0);
  });

  it("asks Mayar again once the gap has passed", async () => {
    const { purchaseId, reference, userId } = await createPendingPurchase({
      paid: false,
    });

    await pollPurchaseState(userId, reference);
    getMayarTransaction.mockClear();
    await backdateLastCheck(purchaseId, 5 * 60_000);
    await pollPurchaseState(userId, reference);

    expect(getMayarTransaction).toHaveBeenCalledTimes(1);
  });

  it("costs nothing once the purchase is settled", async () => {
    const { reference, userId } = await createPendingPurchase();

    await pollPurchaseState(userId, reference);
    getMayarTransaction.mockClear();

    const view = await pollPurchaseState(userId, reference);

    expect(view.status).toBe("paid");
    expect(view.nextPollMs).toBe(0);
    expect(getMayarTransaction).not.toHaveBeenCalled();
  });

  it("refuses a purchase that belongs to somebody else", async () => {
    const { reference } = await createPendingPurchase();

    await expect(pollPurchaseState(createId(), reference)).rejects.toThrow(
      "Unknown purchase"
    );
  });
});

describe("reconciling a purchase", () => {
  beforeEach(() => {
    getMayarTransaction.mockReset();
  });

  it("reports a throttled read rather than failing", async () => {
    const { purchaseId } = await createPendingPurchase({ paid: false });

    await reconcilePurchase(purchaseId, { minAgeMs: 30_000 });
    const second = await reconcilePurchase(purchaseId, { minAgeMs: 30_000 });

    expect(second).toEqual({ settled: false, throttled: true });
  });

  it("always reads when the caller asks for no gap", async () => {
    const { purchaseId } = await createPendingPurchase({ paid: false });

    await reconcilePurchase(purchaseId, { minAgeMs: 0 });
    await reconcilePurchase(purchaseId, { minAgeMs: 0 });

    expect(getMayarTransaction).toHaveBeenCalledTimes(2);
  });
});
