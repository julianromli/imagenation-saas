import { desc, eq, sql } from "drizzle-orm";

import type { BatchStatement } from "@/db";
import { getDb, runBatch } from "@/db";
import type { CREDIT_REASON } from "@/db/schema";
import { creditAccounts, creditEntries } from "@/db/schema";
import { createId } from "@/lib/ids";
import { SIGNUP_GRANT_CREDITS } from "@/lib/pricing";

export type CreditReason = (typeof CREDIT_REASON)[number];

export type LedgerEntryInput = {
  /** Positive adds credits, negative spends them. Never zero. */
  delta: number;
  idrValue?: number;
  note?: string;
  reason: CreditReason;
  refId: string;
  refType: string;
  userId: string;
};

/**
 * Creates the balance row if it is missing.
 *
 * Every spend batch begins with this. Without it a decrement against a missing
 * row would match nothing and succeed quietly, which is the exact failure the
 * batch comment in `src/db/index.ts` warns about — the CHECK can only guard a
 * row that exists.
 */
export function ensureAccountStatement(userId: string): BatchStatement {
  return getDb()
    .insert(creditAccounts)
    .values({ balance: 0, userId })
    .onConflictDoNothing();
}

/**
 * The two statements that move credits: the append-only entry, then the
 * balance cache. Both belong to one batch, so the ledger and the balance can
 * never disagree.
 *
 * A repeat of the same (refType, refId, reason) violates the unique index and
 * aborts the whole batch. That is what makes a replayed webhook and a double
 * refund harmless.
 */
export function ledgerStatements(input: LedgerEntryInput): BatchStatement[] {
  const db = getDb();

  return [
    db.insert(creditEntries).values({
      delta: input.delta,
      id: createId(),
      idrValue: input.idrValue ?? null,
      note: input.note ?? null,
      reason: input.reason,
      refId: input.refId,
      refType: input.refType,
      userId: input.userId,
    }),
    db
      .update(creditAccounts)
      .set({
        // Written as SQL rather than a read-then-write, so two concurrent
        // spends cannot both read the same balance and both succeed.
        balance: sql`${creditAccounts.balance} + ${input.delta}`,
        updatedAt: new Date(),
      })
      .where(eq(creditAccounts.userId, input.userId)),
  ];
}

export async function getBalance(userId: string) {
  const row = await getDb().query.creditAccounts.findFirst({
    where: eq(creditAccounts.userId, userId),
  });

  return row?.balance ?? 0;
}

/**
 * Gives a new account its signup credits, exactly once, ever.
 *
 * The grant is lazy rather than hooked into sign-up: the unique index on
 * (refType, refId, reason) is what enforces "once", so calling this on every
 * balance read is safe and needs no extra bookkeeping.
 */
export async function ensureSignupGrant(userId: string) {
  try {
    await runBatch([
      ensureAccountStatement(userId),
      ...ledgerStatements({
        delta: SIGNUP_GRANT_CREDITS,
        note: "Welcome credits",
        reason: "grant",
        refId: userId,
        refType: "signup",
        userId,
      }),
    ]);
  } catch {
    // Already granted. The unique index refused a second one, which is the
    // whole point of doing it this way.
  }
}

export async function readBalance(userId: string) {
  await ensureSignupGrant(userId);

  return getBalance(userId);
}

export function listEntries(userId: string, limit = 50) {
  return getDb().query.creditEntries.findMany({
    limit,
    orderBy: desc(creditEntries.createdAt),
    where: eq(creditEntries.userId, userId),
  });
}

/**
 * An operator moving credits by hand, from the admin. It is a normal ledger
 * entry with a reason, never an UPDATE on the balance, so support decisions
 * stay auditable.
 */
export function adjustCredits(input: {
  credits: number;
  note: string;
  userId: string;
}) {
  return runBatch([
    ensureAccountStatement(input.userId),
    ...ledgerStatements({
      delta: input.credits,
      note: input.note,
      reason: "adjustment",
      refId: createId(),
      refType: "manual",
      userId: input.userId,
    }),
  ]);
}
