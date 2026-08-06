import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, ilike } from "drizzle-orm";

import { getDb } from "@/db";
import { categories, productImages, products } from "@/db/schema";
import { releaseExpiredReservations } from "@/lib/inventory";

type CatalogFilters = {
  category?: string;
  search?: string;
};

export const getCategories = createServerFn({ method: "GET" }).handler(
  async () => {
    await releaseExpiredReservations();
    const db = getDb();

    return db
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
      })
      .from(categories)
      .orderBy(asc(categories.name));
  }
);

export const getProducts = createServerFn({ method: "GET" })
  .inputValidator((data: CatalogFilters = {}) => data)
  .handler(async ({ data }) => {
    await releaseExpiredReservations();
    const db = getDb();
    const filters = [eq(products.status, "active" as const)];

    if (data.category) {
      filters.push(eq(categories.slug, data.category));
    }

    if (data.search) {
      filters.push(ilike(products.name, `%${data.search}%`));
    }

    const rows = await db
      .select({
        categoryName: categories.name,
        imageUrl: productImages.url,
        product: products,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.sortOrder, 0)
        )
      )
      .where(and(...filters))
      .orderBy(desc(products.createdAt))
      .limit(60);

    return rows.map(({ product, ...row }) => ({
      ...product,
      ...row,
    }));
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .inputValidator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    await releaseExpiredReservations();
    const db = getDb();
    const [row] = await db
      .select({
        categoryName: categories.name,
        imageUrl: productImages.url,
        product: products,
      })
      .from(products)
      .leftJoin(categories, eq(products.categoryId, categories.id))
      .leftJoin(
        productImages,
        and(
          eq(productImages.productId, products.id),
          eq(productImages.sortOrder, 0)
        )
      )
      .where(and(eq(products.slug, slug), eq(products.status, "active")))
      .limit(1);

    if (!row) {
      throw new Error("Product not found");
    }

    return {
      ...row.product,
      categoryName: row.categoryName,
      imageUrl: row.imageUrl,
    };
  });
