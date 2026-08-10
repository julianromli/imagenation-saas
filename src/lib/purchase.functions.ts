import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { getDb } from "@/db";
import { creditPurchases, users } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import { createId, createPurchaseReference } from "@/lib/ids";
import {
  createMayarInvoice,
  createMayarVerificationPayload,
  getMayarTransaction,
  isMayarPaid,
} from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";
import { findPack } from "@/lib/pricing";
import { consumeRateLimit } from "@/lib/rate-limit";

/** How long a Mayar invoice stays payable. */
const INVOICE_LIFETIME_MS = 24 * 60 * 60 * 1000;

const startPurchaseSchema = z.object({
  mobile: z.string().trim().min(8).max(24),
  packId: z.string().min(1).max(40),
});

async function requireUser() {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session.user;
}

/**
 * Creates a Mayar invoice for one credit pack.
 *
 * A pending invoice for the same pack is reused rather than replaced. Mayar
 * answers a duplicate create with 429 and a one-minute wait, so an impatient
 * second click has to land on the first invoice, not on a refusal.
 */
export const startPurchase = createServerFn({ method: "POST" })
  .inputValidator(startPurchaseSchema)
  .handler(async ({ data }) => {
    const user = await requireUser();

    await consumeRateLimit("CHECKOUT_LIMITER", user.id);

    const pack = findPack(data.packId);

    if (!pack) {
      throw new Error("Unknown credit pack");
    }

    const db = getDb();
    const existing = await db.query.creditPurchases.findFirst({
      where: and(
        eq(creditPurchases.userId, user.id),
        eq(creditPurchases.packId, pack.id),
        eq(creditPurchases.status, "pending"),
        gt(creditPurchases.expiresAt, new Date())
      ),
    });

    if (existing?.paymentUrl) {
      return { paymentUrl: existing.paymentUrl, reference: existing.reference };
    }

    // Remembered so the buyer is only ever asked once. Mayar requires it on
    // every invoice.
    await db
      .update(users)
      .set({ mobile: data.mobile, updatedAt: new Date() })
      .where(eq(users.id, user.id));

    const purchaseId = createId();
    const reference = createPurchaseReference();
    const expiresAt = new Date(Date.now() + INVOICE_LIFETIME_MS);
    const { origin } = new URL(getRequestUrl());

    await db.insert(creditPurchases).values({
      amount: pack.amount,
      credits: pack.credits,
      expiresAt,
      id: purchaseId,
      packId: pack.id,
      reference,
      status: "pending",
      userId: user.id,
    });

    const invoice = await createMayarInvoice({
      description: `${pack.credits} Imagenation credits`,
      email: user.email,
      expiredAt: expiresAt.toISOString(),
      // The link back to our own record. The webhook is unsigned, so this is
      // read from the transaction we fetch ourselves, never from the payload.
      extraData: { purchaseId, reference },
      items: [
        {
          description: `${pack.name} — ${pack.credits} credits`,
          quantity: 1,
          rate: pack.amount,
        },
      ],
      mobile: data.mobile,
      name: user.name,
      redirectUrl: `${origin}/credits?purchase=${reference}`,
    });

    await db
      .update(creditPurchases)
      .set({
        mayarInvoiceId: invoice.id,
        mayarTransactionId: invoice.transactionId,
        paymentUrl: invoice.link,
        updatedAt: new Date(),
      })
      .where(eq(creditPurchases.id, purchaseId));

    return { paymentUrl: invoice.link, reference };
  });

export const listPurchases = createServerFn({ method: "GET" }).handler(
  async () => {
    const user = await requireUser();
    const rows = await getDb().query.creditPurchases.findMany({
      limit: 30,
      orderBy: desc(creditPurchases.createdAt),
      where: eq(creditPurchases.userId, user.id),
    });

    return rows.map((row) => ({
      amount: row.amount,
      createdAt: row.createdAt.getTime(),
      credits: row.credits,
      id: row.id,
      packId: row.packId,
      paymentUrl: row.paymentUrl,
      reference: row.reference,
      status: row.status,
    }));
  }
);

/**
 * Re-reads a purchase from Mayar and settles it if it is paid.
 *
 * The webhook is the normal path. This is the fallback for the case that
 * webhook never arrived, and it is the same settlement code, so it cannot
 * grant credits a second time. See ADR-0007.
 */
export async function reconcilePurchase(purchaseId: string) {
  const purchase = await getDb().query.creditPurchases.findFirst({
    where: eq(creditPurchases.id, purchaseId),
  });

  if (!purchase?.mayarTransactionId || purchase.creditedAt) {
    return { settled: false };
  }

  const transaction = await getMayarTransaction(purchase.mayarTransactionId);

  if (!isMayarPaid(transaction.status)) {
    return { settled: false };
  }

  await processMayarWebhook(
    createMayarVerificationPayload(`reconcile-${purchase.id}`, transaction),
    { verifiedTransactionId: transaction.id }
  );

  return { settled: true };
}

export const refreshPurchase = createServerFn({ method: "POST" })
  .inputValidator((id: string) => id)
  .handler(async ({ data: id }) => {
    const user = await requireUser();

    await consumeRateLimit("CHECKOUT_LIMITER", user.id);

    const purchase = await getDb().query.creditPurchases.findFirst({
      where: and(
        eq(creditPurchases.id, id),
        eq(creditPurchases.userId, user.id)
      ),
    });

    if (!purchase) {
      throw new Error("Unknown purchase");
    }

    return reconcilePurchase(purchase.id);
  });
