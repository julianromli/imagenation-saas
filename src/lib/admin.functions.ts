import { createServerFn } from "@tanstack/react-start";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, withTransaction } from "@/db";
import {
  categories,
  orderItems,
  orderStatusHistory,
  orders,
  paymentAttempts,
  productImages,
  products,
  refunds,
  webhookEvents,
} from "@/db/schema";
import { ensureAdmin } from "@/lib/auth.functions";
import { createId } from "@/lib/ids";
import { getMayarTransaction } from "@/lib/mayar";
import { processMayarWebhook } from "@/lib/payment.functions";
import { productInputSchema, statusUpdateSchema } from "@/lib/validation";

const transitions: Record<string, string[]> = {
  cancelled: ["pending_payment", "paid", "processing"],
  delivered: ["shipped"],
  processing: ["paid"],
  shipped: ["processing"],
};
const categorySlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const getAdminStats = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();
    const db = getDb();
    const [[productCount], [orderCount]] = await Promise.all([
      db
        .select({ count: count(products.id) })
        .from(products)
        .where(eq(products.status, "active")),
      db.select({ count: count(orders.id) }).from(orders),
    ]);

    return {
      activeProducts: productCount?.count ?? 0,
      totalOrders: orderCount?.count ?? 0,
    };
  }
);

export const getAdminProducts = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    return getDb()
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
      .orderBy(desc(products.createdAt));
  }
);

export const createProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => productInputSchema.parse(data))
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = getDb();
    const [product] = await db
      .insert(products)
      .values({
        availableStock: data.stock,
        categoryId: data.categoryId ?? null,
        description: data.description,
        id: createId(),
        name: data.name,
        price: data.price,
        slug: data.slug,
      })
      .returning();

    return product;
  });

export const createCategory = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        description: z.string().trim().max(500).optional(),
        name: z.string().trim().min(2).max(80),
        slug: z.string().trim().min(2).max(80).regex(categorySlugPattern),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const [category] = await getDb()
      .insert(categories)
      .values({
        description: data.description,
        id: createId(),
        name: data.name,
        slug: data.slug,
      })
      .returning();

    return category;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAdmin();

    await getDb().delete(categories).where(eq(categories.id, data.id));
  });

export const updateProduct = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    productInputSchema.extend({ id: z.string().min(1) }).parse(data)
  )
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = getDb();
    const [product] = await db
      .update(products)
      .set({
        availableStock: data.stock,
        categoryId: data.categoryId ?? null,
        description: data.description,
        name: data.name,
        price: data.price,
        slug: data.slug,
        updatedAt: new Date(),
      })
      .where(eq(products.id, data.id))
      .returning();

    return product;
  });

export const archiveProduct = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAdmin();

    await getDb()
      .update(products)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(products.id, data.id));
  });

export const setProductImage = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        alt: z.string().trim().min(1).max(160),
        productId: z.string().min(1),
        url: z.url(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    await ensureAdmin();

    return withTransaction(async (transaction) => {
      await transaction
        .delete(productImages)
        .where(eq(productImages.productId, data.productId));
      const [image] = await transaction
        .insert(productImages)
        .values({
          alt: data.alt,
          id: createId(),
          productId: data.productId,
          url: data.url,
        })
        .returning();

      return image;
    });
  });

export const getAdminOrders = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    return getDb().select().from(orders).orderBy(desc(orders.createdAt));
  }
);

export const getAdminOrder = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAdmin();
    const db = getDb();
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, data.id))
      .limit(1);

    if (!order) {
      throw new Error("Order not found");
    }

    const [items, history, attempts] = await Promise.all([
      db.select().from(orderItems).where(eq(orderItems.orderId, order.id)),
      db
        .select()
        .from(orderStatusHistory)
        .where(eq(orderStatusHistory.orderId, order.id))
        .orderBy(desc(orderStatusHistory.createdAt)),
      db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.orderId, order.id))
        .orderBy(desc(paymentAttempts.createdAt)),
    ]);

    return { attempts, history, items, order };
  });

export const updateOrderStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusUpdateSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await ensureAdmin();

    if (data.status === "paid" || data.status === "refunded") {
      throw new Error("Use the payment reconciliation action for this status");
    }

    return withTransaction(async (transaction) => {
      const [order] = await transaction
        .select()
        .from(orders)
        .where(eq(orders.id, data.orderId))
        .limit(1);

      if (!order) {
        throw new Error("Order not found");
      }

      if (!transitions[data.status]?.includes(order.status)) {
        throw new Error(`Cannot move ${order.status} to ${data.status}`);
      }

      await transaction
        .update(orders)
        .set({ status: data.status, updatedAt: new Date() })
        .where(eq(orders.id, order.id));
      await transaction.insert(orderStatusHistory).values({
        actorUserId: session.user.id,
        fromStatus: order.status,
        id: createId(),
        note: data.note,
        orderId: order.id,
        toStatus: data.status,
      });

      return { status: data.status };
    });
  });

export const resyncOrderPayment = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await ensureAdmin();
    const [order] = await getDb()
      .select({
        id: orders.id,
        transactionId: orders.mayarTransactionId,
      })
      .from(orders)
      .where(eq(orders.id, data.id))
      .limit(1);

    if (!order?.transactionId) {
      throw new Error("Order has no Mayar transaction to resync");
    }

    const transaction = await getMayarTransaction(order.transactionId);

    return processMayarWebhook(
      {
        data: {
          amount: transaction.amount,
          id: transaction.id,
          status: transaction.status,
          transactionId: transaction.id,
        },
        eventType: "payment.received",
        id: `admin-resync-${order.id}-${Date.now()}`,
      },
      { verifiedTransactionId: transaction.id }
    );
  });

export const markOrderRefunded = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; reason?: string }) => data)
  .handler(async ({ data }) => {
    const session = await ensureAdmin();

    return withTransaction(async (transaction) => {
      const [order] = await transaction
        .select()
        .from(orders)
        .where(eq(orders.id, data.id))
        .limit(1);

      if (order?.paymentStatus !== "paid") {
        throw new Error("Only paid orders can be marked refunded");
      }

      await transaction
        .update(orders)
        .set({
          paymentStatus: "refunded",
          status: "refunded",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await transaction
        .update(paymentAttempts)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(paymentAttempts.orderId, order.id));
      await transaction.insert(refunds).values({
        amount: order.total,
        id: createId(),
        orderId: order.id,
        reason: data.reason,
        status: "completed",
      });
      await transaction.insert(orderStatusHistory).values({
        actorUserId: session.user.id,
        fromStatus: order.status,
        id: createId(),
        note: "Marked after manual refund in Mayar dashboard",
        orderId: order.id,
        toStatus: "refunded",
      });

      return { status: "refunded" as const };
    });
  });

export const getWebhookEvents = createServerFn({ method: "GET" }).handler(
  async () => {
    await ensureAdmin();

    return getDb()
      .select()
      .from(webhookEvents)
      .orderBy(desc(webhookEvents.createdAt))
      .limit(100);
  }
);
