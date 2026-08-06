import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";

import { getDb, withTransaction } from "@/db";
import {
  inventoryReservations,
  orderItems,
  orders,
  paymentAttempts,
  productImages,
  products,
} from "@/db/schema";
import { getSession } from "@/lib/auth.functions";
import {
  createAccessToken,
  createId,
  createOrderNumber,
  hashToken,
} from "@/lib/ids";
import {
  releaseExpiredReservations,
  releaseOrderReservation,
} from "@/lib/inventory";
import {
  createMayarInvoice,
  createMayarVerificationPayload,
  getMayarTransaction,
} from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  getAppUrl,
  getRuntimeEnv,
  getShippingFlatRate,
} from "@/lib/runtime-env";
import type { CheckoutInput } from "@/lib/validation";
import { checkoutSchema, orderLookupSchema } from "@/lib/validation";

const RESERVATION_MINUTES = 30;
const ORDER_TOKEN_DAYS = 30;
const LOOKUP_RATE_LIMIT = 8;
const LOOKUP_WINDOW_MS = 60_000;
const REFRESH_RATE_LIMIT = 12;
const REFRESH_WINDOW_MS = 60_000;
const CLAIM_RATE_LIMIT = 20;
const CLAIM_WINDOW_MS = 60_000;

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function expiresInDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function orderStatusUrl(accessToken: string) {
  return `${getAppUrl()}/orders/${accessToken}`;
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

export const createOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) => checkoutSchema.parse(data))
  .handler(({ data }) => createOrderForCheckout(data));

export async function createOrderForCheckout(data: CheckoutInput) {
  await releaseExpiredReservations();
  const session = await getSession();
  const accessToken = createAccessToken();
  const accessTokenHash = await hashToken(accessToken);
  const orderId = createId();
  const orderNumber = createOrderNumber();
  const reservationExpiresAt = expiresInMinutes(RESERVATION_MINUTES);
  const accessTokenExpiresAt = expiresInDays(ORDER_TOKEN_DAYS);
  const shippingAmount = getShippingFlatRate();
  const statusUrl = orderStatusUrl(accessToken);
  const lineIds = [...new Set(data.lines.map((line) => line.productId))];

  if (lineIds.length !== data.lines.length) {
    throw new Error("Remove duplicate products from your cart before checkout");
  }

  const prepared = await withTransaction(async (transaction) => {
    const rows = await transaction
      .select({
        imageUrl: productImages.url,
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

      return {
        imageUrl: row.imageUrl,
        line,
        product: row.product,
      };
    });

    let subtotal = 0;

    for (const item of lineItems) {
      // biome-ignore lint/performance/noAwaitInLoops: Stock reservations must be checked serially inside one transaction.
      const updated = await transaction
        .update(products)
        .set({
          availableStock: sql`${products.availableStock} - ${item.line.quantity}`,
          reservedStock: sql`${products.reservedStock} + ${item.line.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, item.product.id),
            sql`${products.availableStock} >= ${item.line.quantity}`
          )
        )
        .returning({ id: products.id });

      if (updated.length === 0) {
        throw new Error(`${item.product.name} does not have enough stock`);
      }

      subtotal += item.product.price * item.line.quantity;
    }

    const total = subtotal + shippingAmount;

    await transaction.insert(orders).values({
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
    });

    await transaction.insert(orderItems).values(
      lineItems.map(({ imageUrl, line, product }) => ({
        id: createId(),
        imageUrl,
        lineTotal: product.price * line.quantity,
        orderId,
        productId: product.id,
        productName: product.name,
        productSlug: product.slug,
        quantity: line.quantity,
        unitPrice: product.price,
      }))
    );

    await transaction.insert(inventoryReservations).values(
      lineItems.map(({ line, product }) => ({
        expiresAt: reservationExpiresAt,
        id: createId(),
        orderId,
        productId: product.id,
        quantity: line.quantity,
        status: "reserved" as const,
      }))
    );

    return {
      lineItems,
      orderId,
      orderNumber,
      subtotal,
      total,
    };
  });

  try {
    const invoice = await createMayarInvoice({
      description: `Order ${prepared.orderNumber}`,
      email: data.email,
      expiredAt: reservationExpiresAt.toISOString(),
      extraData: {
        orderId: prepared.orderId,
        orderNumber: prepared.orderNumber,
      },
      items: [
        ...prepared.lineItems.map(({ line, product }) => ({
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
    await withTransaction(async (transaction) => {
      await transaction.insert(paymentAttempts).values({
        amount: prepared.total,
        currency: "IDR",
        expiresAt: reservationExpiresAt,
        id: createId(),
        invoiceId: invoice.id,
        metadata: {
          environment: getRuntimeEnv().MAYAR_ENVIRONMENT ?? "sandbox",
        },
        orderId: prepared.orderId,
        paymentUrl: invoice.link,
        status: "pending",
        transactionId: invoice.transactionId,
      });
      await transaction
        .update(orders)
        .set({
          mayarInvoiceId: invoice.id,
          mayarTransactionId: invoice.transactionId,
          paymentUrl: invoice.link,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, prepared.orderId));
    });

    return {
      accessToken,
      orderNumber: prepared.orderNumber,
      orderStatusUrl: statusUrl,
      paymentUrl: invoice.link,
      total: prepared.total,
    };
  } catch (error) {
    await releaseOrderReservation(prepared.orderId, "payment_creation_failed");
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

    await consumeRateLimit({
      key: `claim-guest:${session.user.id}`,
      limit: CLAIM_RATE_LIMIT,
      windowMs: CLAIM_WINDOW_MS,
    });

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

    await consumeRateLimit({
      key: `open-guest:${session.user.id}`,
      limit: CLAIM_RATE_LIMIT,
      windowMs: CLAIM_WINDOW_MS,
    });

    const order = await requireMatchingGuestOrder(
      data.orderId,
      session.user.email
    );

    const accessToken = createAccessToken();
    const accessTokenHash = await hashToken(accessToken);
    const accessTokenExpiresAt = expiresInDays(ORDER_TOKEN_DAYS);

    await getDb()
      .update(orders)
      .set({
        accessTokenExpiresAt,
        accessTokenHash,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      accessToken,
      orderNumber: order.orderNumber,
      orderStatusUrl: orderStatusUrl(accessToken),
    };
  });

export const findOrderAccess = createServerFn({ method: "POST" })
  .validator((data: unknown) => orderLookupSchema.parse(data))
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const orderNumber = data.orderNumber.trim().toUpperCase();

    await consumeRateLimit({
      key: `order-lookup:${email}`,
      limit: LOOKUP_RATE_LIMIT,
      windowMs: LOOKUP_WINDOW_MS,
    });

    const db = getDb();
    const [order] = await db
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

    const accessToken = createAccessToken();
    const accessTokenHash = await hashToken(accessToken);
    const accessTokenExpiresAt = expiresInDays(ORDER_TOKEN_DAYS);

    await db
      .update(orders)
      .set({
        accessTokenExpiresAt,
        accessTokenHash,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, order.id));

    return {
      accessToken,
      orderNumber: order.orderNumber,
      orderStatusUrl: orderStatusUrl(accessToken),
    };
  });

export const refreshOrderPayment = createServerFn({ method: "POST" })
  .validator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const tokenHash = await hashToken(data.token);

    await consumeRateLimit({
      key: `order-refresh:${tokenHash}`,
      limit: REFRESH_RATE_LIMIT,
      windowMs: REFRESH_WINDOW_MS,
    });

    const db = getDb();
    const [order] = await db
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
