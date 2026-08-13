import { createServerFn } from "@tanstack/react-start";
import { count, desc, eq, sql, sum } from "drizzle-orm";

import { getDb } from "@/db";
import {
  creditAccounts,
  creditPurchases,
  generations,
  users,
} from "@/db/schema";
import { ensureAdmin } from "@/lib/auth.functions";
import { adjustCredits } from "@/lib/credits";
import { PLANNING_USD_TO_IDR } from "@/lib/pricing";
import { reconcilePurchase } from "@/lib/purchase";
import { creditAdjustmentSchema } from "@/lib/validation";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The numbers an operator needs to answer "is this working, and is it
 * profitable". `upstreamCostUsd` is recorded on every generation for exactly
 * this. See ADR-0018.
 */
export const getAdminStats = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    const db = getDb();
    const since = new Date(Date.now() - 30 * DAY_MS);

    const [[people], [outstanding], [made], [failed], [revenue], [stuck]] =
      await Promise.all([
        db.select({ value: count() }).from(users),
        db.select({ value: sum(creditAccounts.balance) }).from(creditAccounts),
        db
          .select({
            cost: sum(generations.upstreamCostUsd),
            value: count(),
          })
          .from(generations)
          .where(
            sql`${generations.status} = 'succeeded' AND ${generations.createdAt} > ${since.getTime()}`
          ),
        db
          .select({ value: count() })
          .from(generations)
          .where(
            sql`${generations.status} = 'failed' AND ${generations.createdAt} > ${since.getTime()}`
          ),
        db
          .select({ value: sum(creditPurchases.amount) })
          .from(creditPurchases)
          .where(
            sql`${creditPurchases.status} = 'paid' AND ${creditPurchases.createdAt} > ${since.getTime()}`
          ),
        // A non-zero count here means the cron is not running. The credits for
        // these are still taken and have not come back yet. See ADR-0017.
        db
          .select({ value: count() })
          .from(generations)
          .where(
            sql`${generations.status} = 'pending' AND ${generations.createdAt} < ${Date.now() - 30 * 60 * 1000}`
          ),
      ]);

    const upstreamUsd = Number(made?.cost ?? 0);

    return {
      creditsOutstanding: Number(outstanding?.value ?? 0),
      failedLast30Days: failed?.value ?? 0,
      madeLast30Days: made?.value ?? 0,
      revenueIdrLast30Days: Number(revenue?.value ?? 0),
      stuckGenerations: stuck?.value ?? 0,
      upstreamCostIdrLast30Days: Math.round(upstreamUsd * PLANNING_USD_TO_IDR),
      upstreamCostUsdLast30Days: upstreamUsd,
      users: people?.value ?? 0,
    };
  }
);

export const listAccounts = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    const rows = await getDb()
      .select({
        balance: creditAccounts.balance,
        createdAt: users.createdAt,
        email: users.email,
        id: users.id,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .leftJoin(creditAccounts, eq(creditAccounts.userId, users.id))
      .orderBy(desc(users.createdAt))
      .limit(100);

    return rows.map((row) => ({
      ...row,
      balance: row.balance ?? 0,
      createdAt: row.createdAt.getTime(),
    }));
  }
);

/**
 * Moves credits by hand, for support.
 *
 * It writes a ledger entry with a reason rather than setting the balance, so
 * every decision an operator made stays visible. See ADR-0016.
 */
export const adjustAccountCredits = createServerFn({ method: "POST" })
  .validator(creditAdjustmentSchema)
  .handler(async ({ data }) => {
    await ensureAdmin();
    await adjustCredits({
      credits: data.credits,
      note: data.note,
      userId: data.userId,
    });

    return { ok: true };
  });

export const listAllPurchases = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    const rows = await getDb()
      .select({
        amount: creditPurchases.amount,
        createdAt: creditPurchases.createdAt,
        credits: creditPurchases.credits,
        email: users.email,
        id: creditPurchases.id,
        invoiceId: creditPurchases.mayarInvoiceId,
        reference: creditPurchases.reference,
        status: creditPurchases.status,
        transactionId: creditPurchases.mayarTransactionId,
      })
      .from(creditPurchases)
      .innerJoin(users, eq(users.id, creditPurchases.userId))
      .orderBy(desc(creditPurchases.createdAt))
      .limit(100);

    return rows.map((row) => ({ ...row, createdAt: row.createdAt.getTime() }));
  }
);

/** Re-reads one purchase from Mayar. The same settlement path as the webhook. */
export const recheckPurchase = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    await ensureAdmin();

    return reconcilePurchase(id);
  });

export const listFailedGenerations = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    const rows = await getDb()
      .select({
        createdAt: generations.createdAt,
        creditCost: generations.creditCost,
        email: users.email,
        errorCode: generations.errorCode,
        errorMessage: generations.errorMessage,
        id: generations.id,
        refundedAt: generations.refundedAt,
        resolution: generations.resolution,
      })
      .from(generations)
      .innerJoin(users, eq(users.id, generations.userId))
      .where(eq(generations.status, "failed"))
      .orderBy(desc(generations.createdAt))
      .limit(100);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.getTime(),
      refunded: row.refundedAt !== null,
    }));
  }
);
