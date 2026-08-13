/**
 * Buying a credit pack, without the request boundary.
 *
 * The server functions in `purchase.functions.ts` own authentication, rate
 * limiting, and validation. Everything here is plain code so the cron can call
 * it without dragging `createServerFn` into the scheduled path, and so the D1
 * tests can exercise it without rate-limit bindings. Same split as
 * `generation.ts` and `generation.functions.ts`.
 */
import { and, desc, eq, gt, isNull, lt, or } from "drizzle-orm";

import { getDb } from "@/db";
import { creditPurchases, users } from "@/db/schema";
import { createId, createPurchaseReference } from "@/lib/ids";
import {
  createMayarInvoice,
  createMayarVerificationPayload,
  getMayarTransaction,
  isMayarPaid,
} from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";
import type {
  MayarPaymentDetail,
  MayarPaymentMethod,
} from "@/lib/payment-methods";
import {
  parseMayarPaymentDetail,
  readStoredPaymentDetail,
} from "@/lib/payment-methods";
import { type CreditPack, findPack } from "@/lib/pricing";

/**
 * How long a Mayar invoice stays payable.
 *
 * An hour, because a QRIS code and an e-wallet session are short-lived and a
 * countdown the buyer can see beats a code that quietly stopped working. A
 * virtual account is the awkward case: people pay those from a banking app
 * later. `EXPIRY_GRACE_MS` is what keeps that from costing anybody money.
 */
export const INVOICE_LIFETIME_MS = 60 * 60 * 1000;

/**
 * How long past expiry a purchase is still reconciled before it is closed.
 *
 * Expiring a purchase stops the cron from ever looking at it again, so a
 * payment that lands between the last read and the status change would be money
 * taken with no credits given. The grace makes that race harmless.
 */
export const EXPIRY_GRACE_MS = 60 * 60 * 1000;

/** A purchase is "fresh" for this long. The buyer is probably still watching. */
const FRESH_PURCHASE_MS = 2 * 60 * 1000;

/**
 * The shortest gap between two reads of one purchase from Mayar.
 *
 * Mayar allows 50 requests a minute for each API key, so this is the dial that
 * decides how many people can check out at once. Four reads a minute while the
 * buyer watches, one a minute afterwards. See ADR-0021 for the arithmetic.
 */
const READ_BACK_FRESH_MS = 15_000;
const READ_BACK_IDLE_MS = 60_000;

/** How long the browser waits before asking us again. */
const POLL_FRESH_MS = 5000;
const POLL_IDLE_MS = 15_000;

export type PurchaseView = {
  amount: number;
  createdAt: number;
  credits: number;
  expiresAt: number | null;
  id: string;
  /** What the browser should wait before polling again, in milliseconds. */
  nextPollMs: number;
  packId: string;
  paymentDetail: MayarPaymentDetail | null;
  paymentMethod: string | null;
  paymentUrl: string | null;
  reference: string;
  status: string;
};

type PurchaseRow = typeof creditPurchases.$inferSelect;

function ageMs(row: PurchaseRow, now: Date) {
  return now.getTime() - row.createdAt.getTime();
}

/** True while the buyer is probably still watching the payment screen. */
function isWatched(row: PurchaseRow, now: Date) {
  return ageMs(row, now) < FRESH_PURCHASE_MS;
}

function readBackAgeMs(row: PurchaseRow, now: Date) {
  return isWatched(row, now) ? READ_BACK_FRESH_MS : READ_BACK_IDLE_MS;
}

/** Zero means stop asking. */
function nextPollMsFor(row: PurchaseRow, now: Date) {
  if (row.status !== "pending") {
    return 0;
  }

  return isWatched(row, now) ? POLL_FRESH_MS : POLL_IDLE_MS;
}

/**
 * The client-facing shape of a purchase.
 *
 * The stored payment detail is parsed again rather than trusted, so a row
 * written by an older parser cannot break a render.
 */
export function toPurchaseView(
  row: PurchaseRow,
  now = new Date()
): PurchaseView {
  return {
    amount: row.amount,
    createdAt: row.createdAt.getTime(),
    credits: row.credits,
    expiresAt: row.expiresAt?.getTime() ?? null,
    id: row.id,
    nextPollMs: nextPollMsFor(row, now),
    packId: row.packId,
    paymentDetail: readStoredPaymentDetail(row.paymentDetail),
    paymentMethod: row.paymentMethod,
    paymentUrl: row.paymentUrl,
    reference: row.reference,
    status: row.status,
  };
}

/**
 * Takes the right to read one purchase back from Mayar.
 *
 * A compare-and-swap, in the shape of `claimWebhookEvent`: the stamp is written
 * before the provider call, so N browser tabs and the cron produce one request
 * between them, and a provider timeout backs the caller off instead of inviting
 * a retry storm. D1 serialises writes, so exactly one caller can win.
 *
 * `updatedAt` is deliberately left alone. This records that we looked, not that
 * anything about the purchase changed.
 */
export async function claimPurchaseRead(
  purchaseId: string,
  minAgeMs: number,
  now = new Date()
) {
  const staleBefore = new Date(now.getTime() - minAgeMs);
  // A gap of zero means the caller has earned a read whatever happened before:
  // somebody pressed a button. The stamp is still written, so an automatic
  // read that follows is throttled against it.
  const gapHasPassed =
    minAgeMs <= 0
      ? undefined
      : or(
          isNull(creditPurchases.lastCheckedAt),
          lt(creditPurchases.lastCheckedAt, staleBefore)
        );
  const [claimed] = await getDb()
    .update(creditPurchases)
    .set({ lastCheckedAt: now })
    .where(
      and(
        eq(creditPurchases.id, purchaseId),
        eq(creditPurchases.status, "pending"),
        isNull(creditPurchases.creditedAt),
        gapHasPassed
      )
    )
    .returning({ id: creditPurchases.id });

  return Boolean(claimed);
}

/**
 * Re-reads a purchase from Mayar and settles it if it is paid.
 *
 * The webhook is the normal path. This is the fallback for the case that
 * webhook never arrived, and it is the same settlement code, so it cannot grant
 * credits a second time. See ADR-0007.
 *
 * Nothing reads Mayar without claiming first, which is why the claim lives in
 * here rather than in each caller.
 */
export async function reconcilePurchase(
  purchaseId: string,
  options: { minAgeMs?: number } = {}
) {
  const purchase = await getDb().query.creditPurchases.findFirst({
    where: eq(creditPurchases.id, purchaseId),
  });

  if (!purchase?.mayarTransactionId || purchase.creditedAt) {
    return { settled: false, throttled: false };
  }

  const claimed = await claimPurchaseRead(
    purchase.id,
    options.minAgeMs ?? readBackAgeMs(purchase, new Date())
  );

  if (!claimed) {
    return { settled: false, throttled: true };
  }

  const transaction = await getMayarTransaction(purchase.mayarTransactionId);

  if (!isMayarPaid(transaction.status)) {
    return { settled: false, throttled: false };
  }

  await processMayarWebhook(
    createMayarVerificationPayload(`reconcile-${purchase.id}`, transaction),
    { verifiedTransaction: transaction }
  );

  return { settled: true, throttled: false };
}

/**
 * Reads a purchase for the browser, settling it first when that is worth doing.
 *
 * The D1 row answers the question; Mayar is only asked when the row is still
 * pending and the claim above allows it. A throttled poll is an ordinary
 * answer, not an error.
 */
export async function pollPurchaseState(userId: string, reference: string) {
  const db = getDb();
  const purchase = await db.query.creditPurchases.findFirst({
    where: and(
      eq(creditPurchases.reference, reference),
      eq(creditPurchases.userId, userId)
    ),
  });

  if (!purchase) {
    throw new Error("Unknown purchase");
  }

  if (purchase.status !== "pending" || purchase.creditedAt) {
    return toPurchaseView(purchase);
  }

  await reconcilePurchase(purchase.id);

  const settled = await db.query.creditPurchases.findFirst({
    where: eq(creditPurchases.id, purchase.id),
  });

  return toPurchaseView(settled ?? purchase);
}

/** The number kept on the account, read fresh: the session cookie can lag. */
export async function readSavedMobile(userId: string) {
  const row = await getDb().query.user.findFirst({
    columns: { mobile: true },
    where: eq(users.id, userId),
  });

  return row?.mobile ?? null;
}

type CreateInvoiceInput = {
  mobile: string;
  origin: string;
  pack: CreditPack;
  paymentMethod: MayarPaymentMethod;
  user: { email: string; id: string; name: string };
};

/**
 * Creates one Mayar invoice, pinned to one channel.
 *
 * The row is written before Mayar is called so a failed create leaves evidence
 * rather than a silent gap. A row with no `paymentUrl` is that failure, and
 * `listPurchases` hides it.
 */
export async function createPurchaseInvoice({
  mobile,
  origin,
  pack,
  paymentMethod,
  user,
}: CreateInvoiceInput) {
  const db = getDb();
  const purchaseId = createId();
  const reference = createPurchaseReference();
  const expiresAt = new Date(Date.now() + INVOICE_LIFETIME_MS);

  await db.insert(creditPurchases).values({
    amount: pack.amount,
    credits: pack.credits,
    expiresAt,
    id: purchaseId,
    packId: pack.id,
    paymentMethod,
    reference,
    status: "pending",
    userId: user.id,
  });

  const invoice = await createMayarInvoice({
    description: `${pack.credits} Imagenation credits · ${reference}`,
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
    mobile,
    name: user.name,
    paymentMethod,
    redirectUrl: `${origin}/credits?purchase=${reference}`,
  });

  const paymentDetail = parseMayarPaymentDetail(invoice.paymentDetail);
  // Mayar's channel expiry is the one that matters when it gives one: the QR
  // stops working then, whatever the invoice says.
  const channelExpiry = paymentDetail?.expiresAt
    ? new Date(paymentDetail.expiresAt)
    : null;

  const [saved] = await db
    .update(creditPurchases)
    .set({
      expiresAt: channelExpiry ?? expiresAt,
      mayarInvoiceId: invoice.id,
      mayarTransactionId: invoice.transactionId,
      paymentDetail: paymentDetail
        ? (paymentDetail as unknown as Record<string, never>)
        : null,
      paymentUrl: invoice.link,
      updatedAt: new Date(),
    })
    .where(eq(creditPurchases.id, purchaseId))
    .returning();

  return toPurchaseView(saved);
}

/**
 * The purchase a second click should land on.
 *
 * Reuse is keyed on the pack and the channel together: an invoice carries one
 * channel, so a buyer who switched from QRIS to a virtual account needs a new
 * one. Ordered newest first, because more than one row can match.
 */
export function findReusablePurchase(
  userId: string,
  packId: string,
  paymentMethod: MayarPaymentMethod
) {
  return getDb().query.creditPurchases.findFirst({
    orderBy: desc(creditPurchases.createdAt),
    where: and(
      eq(creditPurchases.userId, userId),
      eq(creditPurchases.packId, packId),
      eq(creditPurchases.paymentMethod, paymentMethod),
      eq(creditPurchases.status, "pending"),
      gt(creditPurchases.expiresAt, new Date())
    ),
  });
}

export function packForPurchase(packId: string) {
  const pack = findPack(packId);

  if (!pack) {
    throw new Error("Unknown credit pack");
  }

  return pack;
}
