import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { cartItems, carts, productImages, products } from "@/db/schema";
import { getSession } from "@/lib/auth.functions";
import { cartLinesSchema, MAX_CART_LINE_QUANTITY } from "@/lib/validation";

async function getOrCreateCart(userId: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(carts)
    .values({
      id: crypto.randomUUID(),
      userId,
    })
    .returning();

  if (!created) {
    throw new Error("Unable to create cart");
  }

  return created;
}

export const getServerCart = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await getSession();

    if (!session) {
      return [];
    }

    const db = getDb();
    const cart = await getOrCreateCart(session.user.id);

    return db
      .select({
        imageObjectKey: productImages.objectKey,
        product: products,
        quantity: cartItems.quantity,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.sortOrder, 0)
        )
      )
      .where(eq(cartItems.cartId, cart.id));
  }
);

export const mergeCart = createServerFn({ method: "POST" })
  .validator((data: unknown) => cartLinesSchema.parse(data))
  .handler(async ({ data }) => {
    const session = await getSession();

    if (!session) {
      throw new Error("Sign in before merging a cart");
    }

    const cart = await getOrCreateCart(session.user.id);
    const db = getDb();

    for (const line of data) {
      // biome-ignore lint/performance/noAwaitInLoops: Each line is validated and upserted in order for deterministic cart merges.
      const [product] = await db
        .select({ id: products.id })
        .from(products)
        .where(
          and(eq(products.id, line.productId), eq(products.status, "active"))
        )
        .limit(1);

      if (!product) {
        continue;
      }

      await db
        .insert(cartItems)
        .values({
          cartId: cart.id,
          id: crypto.randomUUID(),
          productId: line.productId,
          quantity: line.quantity,
        })
        .onConflictDoUpdate({
          set: {
            // Capped, because a merge adds to what the line already holds and
            // could otherwise store more than the cart schema accepts back.
            quantity: sql`min(${cartItems.quantity} + ${line.quantity}, ${MAX_CART_LINE_QUANTITY})`,
            updatedAt: new Date(),
          },
          target: [cartItems.cartId, cartItems.productId],
        });
    }

    return getServerCart();
  });
