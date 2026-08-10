import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { type BatchStatement, getDb, runBatch } from "@/db";
import {
  checkoutRequests,
  inventoryReservations,
  orderItems,
  orders,
  paymentAttempts,
  productImages,
  products,
} from "@/db/schema";
import { getSession } from "@/lib/auth.functions";
import { InvalidRequestError } from "@/lib/errors";
import {
  createAccessToken,
  createId,
  createOrderNumber,
  hashToken,
} from "@/lib/ids";
import { releaseOrderReservation } from "@/lib/inventory";
import {
  createMayarInvoice,
  createMayarVerificationPayload,
  getMayarTransaction,
} from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { getRuntimeEnv, getShippingFlatRate } from "@/lib/runtime-env";
import type { CheckoutInput } from "@/lib/validation";
import { checkoutSchema, orderLookupSchema } from "@/lib/validation";

const RESERVATION_MINUTES = 30;
const ORDER_TOKEN_DAYS = 30;
const UNIQUE_VIOLATION = /UNIQUE constraint failed/i;
const CHECK_VIOLATION = /CHECK constraint failed/i;
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
// Printable ASCII only. The value is stored as a primary key and echoed in
// errors, so control characters have no business in it.
const PRINTABLE_ASCII = /^[\x20-\x7E]+$/;

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function expiresInDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// The public origin is taken from the request rather than from configuration.
// A one-click deploy does not know its own URL in advance. See ADR-0014.
//
// `getRequest()` is server-only, so it is called inside handler bodies, which
// the client build strips. Module-level helpers take the origin as an argument.
function currentOrigin() {
  return new URL(getRequest().url).origin;
}

function orderStatusUrl(origin: string, accessToken: string) {
  return `${origin}/orders/${accessToken}`;
}

// Identifies the cart and delivery details behind an idempotency key, so that a
// replayed key carrying different data is refused. See ADR-0003.
function checkoutFingerprint(data: CheckoutInput) {
  const lines = [...data.lines]
    .sort((left, right) => left.productId.localeCompare(right.productId))
    .map((line) => `${line.productId}x${line.quantity}`)
    .join(",");

  return hashToken(
    [
      data.email.trim().toLowerCase(),
      data.guestName.trim(),
      data.phone.trim(),
      data.addressLine.trim(),
      data.city.trim(),
      data.province.trim(),
      data.postalCode.trim(),
      lines,
    ].join("|")
  );
}

async function requireMatchingGuestOrder(orderId: string, email: string) {
  const db = getDb();
  const [order] = await db
    .select({
      guestEmail: orders.guestEmail,
      id: orders.id,
      orderNumber: orders.orderNumber,
      userId: orders.userId,
    })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) {
    throw new Error("Order not found");
  }

  if (order.guestEmail.toLowerCase() !== email.toLowerCase()) {
    throw new Error("The signed-in email does not match this order");
  }

  if (order.userId) {
    throw new Error("This order is already linked to an account");
  }

  return order;
}

async function reissueAccessToken(orderId: string) {
  const accessToken = createAccessToken();

  await getDb()
    .update(orders)
    .set({
      accessTokenExpiresAt: expiresInDays(ORDER_TOKEN_DAYS),
      accessTokenHash: await hashToken(accessToken),
      updatedAt: new Date(),
    })
    .where(eq(orders.id, orderId));

  return accessToken;
}

/**
 * Answers a retry that carries an idempotency key already on record.
 *
 * The original response held an access token, and only its hash is stored, so a
 * fresh token is issued for the same order. Only a client holding the original
 * key can reach this path.
 */
async function replayCheckout(
  idempotencyKey: string,
  fingerprint: string,
  origin: string
) {
  const [existing] = await getDb()
    .select({
      fingerprint: checkoutRequests.fingerprint,
      orderId: checkoutRequests.orderId,
    })
    .from(checkoutRequests)
    .where(eq(checkoutRequests.id, idempotencyKey))
    .limit(1);

  if (!existing) {
    return null;
  }

  if (existing.fingerprint !== fingerprint) {
    throw new Error(
      "This idempotency key was already used for a different checkout"
    );
  }

  const [order] = await getDb()
    .select({
      orderNumber: orders.orderNumber,
      paymentUrl: orders.paymentUrl,
      total: orders.total,
    })
    .from(orders)
    .where(eq(orders.id, existing.orderId))
    .limit(1);

  if (!order) {
    throw new Error(
      "The original order for this checkout is no longer available"
    );
  }

  const accessToken = await reissueAccessToken(existing.orderId);

  return {
    accessToken,
    orderNumber: order.orderNumber,
    orderStatusUrl: orderStatusUrl(origin, accessToken),
    paymentUrl: order.paymentUrl,
    total: order.total,
  };
}

async function describeStockShortfall(
  lines: CheckoutInput["lines"]
): Promise<string> {
  const rows = await getDb()
    .select({
      availableStock: products.availableStock,
      id: products.id,
      name: products.name,
    })
    .from(products)
    .where(
      inArray(
        products.id,
        lines.map((line) => line.productId)
      )
    );
  const stockById = new Map(rows.map((row) => [row.id, row]));
  const short = lines.find((line) => {
    const row = stockById.get(line.productId);

    return !row || row.availableStock < line.quantity;
  });

  return short
    ? `${stockById.get(short.productId)?.name ?? "A product"} does not have enough stock`
    : "One or more products do not have enough stock";
}

/**
 * Checks the key a caller supplied before it becomes a primary key.
 *
 * The value is stored and echoed in errors, so it is bounded and restricted to
 * printable characters here rather than trusted as it arrives.
 */
function requireIdempotencyKey(rawKey: string | null | undefined) {
  const idempotencyKey = rawKey?.trim();

  if (!idempotencyKey) {
    throw new InvalidRequestError(
      "Checkout requires an Idempotency-Key header"
    );
  }

  if (
    idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH ||
    !PRINTABLE_ASCII.test(idempotencyKey)
  ) {
    throw new InvalidRequestError("That Idempotency-Key is not a valid value");
  }

  return idempotencyKey;
}

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(({ data }) => {
    const request = getRequest();

    return createOrderForCheckout(
      data,
      request.headers.get("Idempotency-Key"),
      new URL(request.url).origin
    );
  });

/**
 * The one checkout path. Both the server function and `/api/checkout` reach the
 * store through here, so the key check and the rate limit live in this function
 * rather than in each caller. A guard a caller can skip by choosing the other
 * entry point is not a guard.
 */
export async function createOrderForCheckout(
  data: CheckoutInput,
  rawIdempotencyKey: string | null | undefined,
  origin: string
) {
  const idempotencyKey = requireIdempotencyKey(rawIdempotencyKey);

  // Checkout writes rows and calls a paid provider API, so it is rate limited
  // like every other public write path. The email is the key, because a guest
  // checkout has no session to key on.
  await consumeRateLimit(
    "CHECKOUT_LIMITER",
    `checkout:${data.email.trim().toLowerCase()}`
  );

  const fingerprint = await checkoutFingerprint(data);
  const replayed = await replayCheckout(idempotencyKey, fingerprint, origin);

  if (replayed) {
    return replayed;
  }

  const session = await getSession();
  const accessToken = createAccessToken();
  const accessTokenHash = await hashToken(accessToken);
  const orderId = createId();
  const orderNumber = createOrderNumber();
  const now = new Date();
  const reservationExpiresAt = expiresInMinutes(RESERVATION_MINUTES);
  const accessTokenExpiresAt = expiresInDays(ORDER_TOKEN_DAYS);
  const shippingAmount = getShippingFlatRate();
  const statusUrl = orderStatusUrl(origin, accessToken);
  const lineIds = [...new Set(data.lines.map((line) => line.productId))];

  if (lineIds.length !== data.lines.length) {
    throw new Error("Remove duplicate products from your cart before checkout");
  }

  const db = getDb();
  const rows = await db
    .select({
      imageObjectKey: productImages.objectKey,
      product: products,
    })
    .from(products)
    .leftJoin(
      productImages,
      and(
        eq(productImages.productId, products.id),
        eq(productImages.sortOrder, 0)
      )
    )
    .where(and(inArray(products.id, lineIds), eq(products.status, "active")));
  const productById = new Map(rows.map((row) => [row.product.id, row]));

  if (productById.size !== lineIds.length) {
    throw new Error("One or more products are no longer available");
  }

  const lineItems = data.lines.map((line) => {
    const row = productById.get(line.productId);

    if (!row) {
      throw new Error("One or more products are no longer available");
    }

    return { imageObjectKey: row.imageObjectKey, line, product: row.product };
  });
  const subtotal = lineItems.reduce(
    (sum, { line, product }) => sum + product.price * line.quantity,
    0
  );
  const total = subtotal + shippingAmount;

  // One batch. The stock guard is the check constraint on the product row, and
  // the duplicate guard is the primary key on checkout_request. Either one
  // failing rolls the whole checkout back. See ADR-0012 and ADR-0003.
  const statements: BatchStatement[] = lineItems.map(({ line, product }) =>
    db
      .update(products)
      .set({
        availableStock: sql`${products.availableStock} - ${line.quantity}`,
        reservedStock: sql`${products.reservedStock} + ${line.quantity}`,
        updatedAt: now,
      })
      .where(eq(products.id, product.id))
  );

  statements.push(
    db.insert(orders).values({
      accessTokenExpiresAt,
      accessTokenHash,
      addressLine: data.addressLine,
      city: data.city,
      currency: "IDR",
      guestEmail: data.email,
      guestName: data.guestName,
      guestPhone: data.phone,
      id: orderId,
      orderNumber,
      paymentStatus: "pending",
      postalCode: data.postalCode,
      province: data.province,
      reservationExpiresAt,
      shippingAmount,
      status: "pending_payment",
      subtotal,
      total,
      userId: session?.user.id,
    }),
    db.insert(orderItems).values(
      lineItems.map(({ imageObjectKey, line, product }) => ({
        id: createId(),
        imageObjectKey,
        lineTotal: product.price * line.quantity,
        orderId,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        quantity: line.quantity,
        unitPrice: product.price,
      }))
    ),
    db.insert(inventoryReservations).values(
      lineItems.map(({ line, product }) => ({
        expiresAt: reservationExpiresAt,
        id: createId(),
        orderId,
        productId: product.id,
        quantity: line.quantity,
        status: "reserved" as const,
      }))
    ),
    // Inserted after the order, because it points at it. Order within a batch
    // does not affect atomicity.
    db.insert(checkoutRequests).values({
      fingerprint,
      id: idempotencyKey,
      orderId,
    })
  );

  try {
    await runBatch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";

    if (CHECK_VIOLATION.test(message)) {
      // The constraint does not say which product ran out, so ask afterwards to
      // build a message a buyer can act on. See ADR-0012.
      throw new Error(await describeStockShortfall(data.lines), {
        cause: error,
      });
    }

    if (UNIQUE_VIOLATION.test(message)) {
      const raced = await replayCheckout(idempotencyKey, fingerprint, origin);

      if (raced) {
        return raced;
      }
    }

    throw error;
  }

  try {
    const invoice = await createMayarInvoice({
      description: `Order ${orderNumber}`,
      email: data.email,
      expiredAt: reservationExpiresAt.toISOString(),
      extraData: {
        orderId,
        orderNumber,
      },
      items: [
        ...lineItems.map(({ line, product }) => ({
          description: product.name,
          quantity: line.quantity,
          rate: product.price,
        })),
        ...(shippingAmount > 0
          ? [
              {
                description: "Shipping",
                quantity: 1,
                rate: shippingAmount,
              },
            ]
          : []),
      ],
      mobile: data.phone,
      name: data.guestName,
      redirectUrl: statusUrl,
    });

    await runBatch([
      db.insert(paymentAttempts).values({
        amount: total,
        currency: "IDR",
        expiresAt: reservationExpiresAt,
        id: createId(),
        invoiceId: invoice.id,
        metadata: {
          environment: getRuntimeEnv().MAYAR_ENVIRONMENT ?? "sandbox",
        },
        orderId,
        paymentUrl: invoice.link,
        status: "pending",
        transactionId: invoice.transactionId,
      }),
      db
        .update(orders)
        .set({
          mayarInvoiceId: invoice.id,
          mayarTransactionId: invoice.transactionId,
          paymentUrl: invoice.link,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, orderId)),
    ]);

    return {
      accessToken,
      orderNumber,
      orderStatusUrl: statusUrl,
      paymentUrl: invoice.link,
      total,
    };
  } catch (error) {
    // The invoice failure is what the caller needs to see. A cleanup that also
    // fails must not replace it, or the real cause is lost.
    await releaseOrderReservation(orderId, "payment_creation_failed").catch(
      (releaseError) => {
        console.error(
          `Failed to release reservation for ${orderId} after invoice creation failed`,
          releaseError
        );
      }
    );

    throw error;
  }
}

export const getOrderByAccessToken = createServerFn({ method: "GET" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tokenHash = await hashToken(data.token);
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.accessTokenHash, tokenHash),
          gt(orders.accessTokenExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!order) {
      throw new Error("Order not found or access link expired");
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt));

    return { items, order };
  });

export const getMyOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await getSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    return getDb()
      .select()
      .from(orders)
      .where(eq(orders.userId, session.user.id))
      .orderBy(desc(orders.createdAt));
  }
);

export const getMyOrderById = createServerFn({ method: "GET" })
  .validator((data: { orderId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(
        and(eq(orders.id, data.orderId), eq(orders.userId, session.user.id))
      )
      .limit(1);

    if (!order) {
      throw new Error("Order not found");
    }

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id))
      .orderBy(asc(orderItems.createdAt));

    return { items, order };
  });

export const getClaimableGuestOrders = createServerFn({
  method: "GET",
}).handler(async () => {
  const session = await getSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  const email = session.user.email.trim().toLowerCase();

  return getDb()
    .select({
      createdAt: orders.createdAt,
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      total: orders.total,
    })
    .from(orders)
    .where(
      and(isNull(orders.userId), sql`lower(${orders.guestEmail}) = ${email}`)
    )
    .orderBy(desc(orders.createdAt))
    .limit(20);
});

export const claimOrder = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Sign in before claiming an order");
    }

    const tokenHash = await hashToken(data.token);
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.accessTokenHash, tokenHash))
      .limit(1);

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.guestEmail.toLowerCase() !== session.user.email.toLowerCase()) {
      throw new Error("The signed-in email does not match this order");
    }

    if (order.userId && order.userId !== session.user.id) {
      throw new Error("This order is already linked to another account");
    }

    await db
      .update(orders)
      .set({ updatedAt: new Date(), userId: session.user.id })
      .where(eq(orders.id, order.id));
  });

export const claimGuestOrderById = createServerFn({ method: "POST" })
  .validator((data: { orderId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Sign in before claiming an order");
    }

    await consumeRateLimit("ORDER_CLAIM_LIMITER", `claim:${session.user.id}`);

    const order = await requireMatchingGuestOrder(
      data.orderId,
      session.user.email
    );

    await getDb()
      .update(orders)
      .set({ updatedAt: new Date(), userId: session.user.id })
      .where(eq(orders.id, order.id));

    return { orderNumber: order.orderNumber };
  });

export const openClaimableGuestOrder = createServerFn({ method: "POST" })
  .validator((data: { orderId: string }) => data)
  .handler(async ({ data }) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Sign in before opening an order");
    }

    await consumeRateLimit("ORDER_CLAIM_LIMITER", `open:${session.user.id}`);

    const origin = currentOrigin();
    const order = await requireMatchingGuestOrder(
      data.orderId,
      session.user.email
    );
    const accessToken = await reissueAccessToken(order.id);

    return {
      accessToken,
      orderNumber: order.orderNumber,
      orderStatusUrl: orderStatusUrl(origin, accessToken),
    };
  });

export const findOrderAccess = createServerFn({ method: "POST" })
  .validator((data: unknown) => orderLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const origin = currentOrigin();
    const email = data.email.trim().toLowerCase();
    const orderNumber = data.orderNumber.trim().toUpperCase();

    await consumeRateLimit("ORDER_LOOKUP_LIMITER", `lookup:${email}`);

    const [order] = await getDb()
      .select({
        guestEmail: orders.guestEmail,
        id: orders.id,
        orderNumber: orders.orderNumber,
      })
      .from(orders)
      .where(eq(orders.orderNumber, orderNumber))
      .limit(1);

    if (!order || order.guestEmail.toLowerCase() !== email) {
      throw new Error("No order matched that email and order number");
    }

    const accessToken = await reissueAccessToken(order.id);

    return {
      accessToken,
      orderNumber: order.orderNumber,
      orderStatusUrl: orderStatusUrl(origin, accessToken),
    };
  });

export const refreshOrderPayment = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tokenHash = await hashToken(data.token);

    await consumeRateLimit("PAYMENT_REFRESH_LIMITER", `refresh:${tokenHash}`);

    const [order] = await getDb()
      .select({
        id: orders.id,
        paymentStatus: orders.paymentStatus,
        status: orders.status,
        transactionId: orders.mayarTransactionId,
      })
      .from(orders)
      .where(
        and(
          eq(orders.accessTokenHash, tokenHash),
          gt(orders.accessTokenExpiresAt, new Date())
        )
      )
      .limit(1);

    if (!order) {
      throw new Error("Order not found or access link expired");
    }

    if (order.paymentStatus === "paid" || order.status === "paid") {
      return { alreadyPaid: true, processed: true };
    }

    if (!order.transactionId) {
      throw new Error("This order has no Mayar transaction to refresh");
    }

    const transaction = await getMayarTransaction(order.transactionId);
    const result = await processMayarWebhook(
      createMayarVerificationPayload(
        `customer-refresh-${order.id}-${Date.now()}`,
        transaction
      ),
      { verifiedTransactionId: transaction.id }
    );

    return {
      alreadyPaid: false,
      processed: Boolean(result.processed),
    };
  });
