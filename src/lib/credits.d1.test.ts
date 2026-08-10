import { beforeEach, describe, expect, it } from "vitest";

import { getDb, runBatch } from "@/db";
import { users } from "@/db/schema";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
import { createId } from "@/lib/ids";

async function createUser(balance: number) {
  const id = createId();

  await getDb()
    .insert(users)
    .values({
      email: `${id}@example.test`,
      id,
      name: "Test person",
    });

  await runBatch([
    ensureAccountStatement(id),
    ...ledgerStatements({
      delta: balance,
      reason: "grant",
      refId: id,
      refType: "signup",
      userId: id,
    }),
  ]);

  return id;
}

function spend(userId: string, credits: number, refId: string) {
  return runBatch([
    ensureAccountStatement(userId),
    ...ledgerStatements({
      delta: -credits,
      reason: "spend",
      refId,
      refType: "generation",
      userId,
    }),
  ]);
}

async function readState(userId: string) {
  const db = getDb();
  const account = await db.query.creditAccounts.findFirst({
    where: (row, { eq }) => eq(row.userId, userId),
  });
  const entries = await db.query.creditEntries.findMany({
    where: (row, { eq }) => eq(row.userId, userId),
  });

  return {
    balance: account?.balance ?? 0,
    ledgerSum: entries.reduce((total, entry) => total + entry.delta, 0),
  };
}

describe("the credit ledger", () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser(5);
  });

  it("refuses to let concurrent spends take the balance below zero", async () => {
    // Five simultaneous two-credit spends against a five-credit balance. At
    // most two can succeed. The guard is the CHECK constraint, not the
    // application: a read-then-write would let all five read the same balance.
    const attempts = await Promise.allSettled(
      Array.from({ length: 5 }, (_, index) =>
        spend(userId, 2, `generation-${index}`)
      )
    );

    const succeeded = attempts.filter(
      (attempt) => attempt.status === "fulfilled"
    ).length;
    const state = await readState(userId);

    expect(succeeded).toBeLessThanOrEqual(2);
    expect(state.balance).toBeGreaterThanOrEqual(0);
    expect(state.balance).toBe(5 - succeeded * 2);
    // The cache and the append-only ledger must never disagree.
    expect(state.ledgerSum).toBe(state.balance);
  });

  it("refuses a second entry for the same reference and reason", async () => {
    await spend(userId, 2, "generation-a");

    await expect(spend(userId, 2, "generation-a")).rejects.toThrow();

    const state = await readState(userId);

    expect(state.balance).toBe(3);
    expect(state.ledgerSum).toBe(3);
  });

  it("allows a refund of a spend it already recorded", async () => {
    await spend(userId, 2, "generation-b");

    await runBatch(
      ledgerStatements({
        delta: 2,
        reason: "refund",
        refId: "generation-b",
        refType: "generation",
        userId,
      })
    );

    const state = await readState(userId);

    expect(state.balance).toBe(5);
    expect(state.ledgerSum).toBe(5);
  });

  it("never rewrites an entry, so history survives a refund", async () => {
    await spend(userId, 2, "generation-c");
    await runBatch(
      ledgerStatements({
        delta: 2,
        reason: "refund",
        refId: "generation-c",
        refType: "generation",
        userId,
      })
    );

    const entries = await getDb().query.creditEntries.findMany({
      where: (row, { eq }) => eq(row.userId, userId),
    });

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.reason).sort()).toEqual([
      "grant",
      "refund",
      "spend",
    ]);
  });
});

describe("the balance guard", () => {
  it("cannot be bypassed by spending against an account that does not exist", async () => {
    const ghost = createId();

    // The account row is created by the same batch, so the decrement always
    // has a row to hit and the CHECK always applies. A bare UPDATE would match
    // nothing and succeed silently.
    await expect(
      runBatch([
        ensureAccountStatement(ghost),
        ...ledgerStatements({
          delta: -2,
          reason: "spend",
          refId: "generation-ghost",
          refType: "generation",
          userId: ghost,
        }),
      ])
    ).rejects.toThrow();

    const account = await getDb().query.creditAccounts.findFirst({
      where: (row, { eq }) => eq(row.userId, ghost),
    });

    expect(account).toBeUndefined();
  });
});

describe("account isolation", () => {
  it("keeps one account's spending off another's balance", async () => {
    const first = await createUser(4);
    const second = await createUser(4);

    await spend(first, 4, "generation-first");

    expect((await readState(first)).balance).toBe(0);
    expect((await readState(second)).balance).toBe(4);
  });
});
