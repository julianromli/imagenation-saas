import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { categories, productImages, products } from "@/db/schema";
import { catalogFiltersSchema } from "@/lib/validation";

type ProductRow = {
  categoryName: string | null;
  imageObjectKey: string | null;
  product: typeof products.$inferSelect;
};

const CATALOG_LIMIT = 60;

// Catalogue reads no longer write, so they can be cached. Sixty seconds at the
// shared cache matches the tolerance already accepted in ADR-0010: stock may
// lag a released reservation by a few minutes. Browsers revalidate every time,
// so an admin edit shows up for the editor at once.
const CATALOG_CACHE =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

function cacheCatalogResponse() {
  setResponseHeader("cache-control", CATALOG_CACHE);
}
const LIKE_WILDCARDS = /[\\%_]/g;

// SQLite reads % and _ as wildcards. A buyer typing them should match the
// characters themselves, which needs both an escape prefix and an ESCAPE clause.
function searchCondition(search: string) {
  const pattern = `%${search.replace(LIKE_WILDCARDS, "\\$&")}%`;

  return sql`${products.name} LIKE ${pattern} ESCAPE '\'`;
}

function selectProducts() {
  return getDb()
    .select({
      categoryName: categories.name,
      imageObjectKey: productImages.objectKey,
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
    );
}

function flatten(rows: ProductRow[]) {
  return rows.map(({ product, ...row }) => ({ ...product, ...row }));
}

export type CatalogProductRow = ReturnType<typeof flatten>[number];

export const getCategories = createServerFn({ method: "GET" }).handler(() => {
  cacheCatalogResponse();

  // Only categories a shopper can actually land in. Without the join an empty
  // category still renders a filter chip that leads to a dead-end page.
  return getDb()
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
    })
    .from(categories)
    .innerJoin(
      products,
      and(
        eq(products.categoryId, categories.id),
        eq(products.status, "active" as const)
      )
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.name));
});

export const getProducts = createServerFn({ method: "GET" })
  .validator((data: unknown = {}) => catalogFiltersSchema.parse(data))
  .handler(async ({ data }) => {
    cacheCatalogResponse();

    const filters = [eq(products.status, "active" as const)];

    if (data.category) {
      filters.push(eq(categories.slug, data.category));
    }

    if (data.search) {
      // Filtering happens here rather than in the browser, so a search ships
      // the matching rows instead of the whole catalogue.
      filters.push(searchCondition(data.search));
    }

    const rows = await selectProducts()
      .where(and(...filters))
      .orderBy(desc(products.createdAt))
      .limit(CATALOG_LIMIT);

    return flatten(rows);
  });

/**
 * Resolves the products a cart refers to. The cart lives in the browser, so the
 * page asks for the handful of products it holds instead of the whole catalogue.
 */
export const getProductsByIds = createServerFn({ method: "GET" })
  .validator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => {
    const ids = [...new Set(data.ids)];

    if (ids.length === 0) {
      return [];
    }

    // Refuse rather than truncate. A silently shortened list would show the
    // buyer a cart that is missing lines, with no sign anything was dropped.
    if (ids.length > CATALOG_LIMIT) {
      throw new Error(
        `A cart cannot hold more than ${CATALOG_LIMIT} different products`
      );
    }

    const rows = await selectProducts().where(
      and(inArray(products.id, ids), eq(products.status, "active"))
    );

    return flatten(rows);
  });

export const getProductBySlug = createServerFn({ method: "GET" })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }) => {
    cacheCatalogResponse();

    const rows = await selectProducts()
      .where(and(eq(products.slug, slug), eq(products.status, "active")))
      .limit(1);
    const [row] = flatten(rows);

    if (!row) {
      throw new Error("Product not found");
    }

    return row;
  });
