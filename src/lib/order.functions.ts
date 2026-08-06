import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, gt, inArray, sql } from "drizzle-orm";

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
import { createMayarInvoice } from "@/lib/mayar";
import { getRuntimeEnv, getShippingFlatRate } from "@/lib/runtime-env";
import type { CheckoutInput } from "@/lib/validation";
import { checkoutSchema } from "@/lib/validation";

const RESERVATION_MINUTES = 30;
const ORDER_TOKEN_DAYS = 30;

function expiresInMinutes(minutes: number) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function expiresInDays(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export const createOrder = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => checkoutSchema.parse(data))
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
      paymentUrl: invoice.link,
      total: prepared.total,
    };
  } catch (error) {
    await releaseOrderReservation(prepared.orderId, "payment_creation_failed");
    throw error;
  }
}

export const getOrderByAccessToken = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
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

export const claimOrder = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string }) => data)
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
