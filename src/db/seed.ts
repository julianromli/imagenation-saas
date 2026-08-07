import { env } from "cloudflare:workers";

import { getDb } from "@/db";
import { categories, productImages, products } from "@/db/schema";
import { ALLOWED_IMAGE_TYPES, PRODUCT_IMAGE_PREFIX } from "@/lib/uploads";

const seedCategories = [
  {
    description: "Everyday objects made for a calmer routine.",
    id: "category-everyday",
    name: "Everyday",
    slug: "everyday",
  },
  {
    description: "Small details that make a room feel considered.",
    id: "category-home",
    name: "Home",
    slug: "home",
  },
];

const seedProducts = [
  {
    categoryId: "category-everyday",
    description:
      "A lightweight daily carry with a structured shape and a soft, durable finish.",
    id: "product-canvas-tote",
    name: "Canvas tote",
    price: 189_000,
    slug: "canvas-tote",
    sourceUrl:
      "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85",
    stock: 24,
  },
  {
    categoryId: "category-home",
    description:
      "A warm ceramic cup with a comfortable handle for slow mornings and long afternoons.",
    id: "product-stoneware-cup",
    name: "Stoneware cup",
    price: 125_000,
    slug: "stoneware-cup",
    sourceUrl:
      "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=85",
    stock: 18,
  },
  {
    categoryId: "category-home",
    description:
      "A soft, textured throw that adds a quiet layer of comfort to your favorite chair.",
    id: "product-textured-throw",
    name: "Textured throw",
    price: 349_000,
    slug: "textured-throw",
    sourceUrl:
      "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=1200&q=85",
    stock: 12,
  },
  {
    categoryId: "category-everyday",
    description:
      "A clean-lined bottle built for desks, commutes, and the space between both.",
    id: "product-desk-bottle",
    name: "Desk bottle",
    price: 219_000,
    slug: "desk-bottle",
    sourceUrl:
      "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=85",
    stock: 30,
  },
];

/**
 * Copies a sample image into R2.
 *
 * The database holds an object key, not an address, so a remote URL cannot be
 * stored directly. See ADR-0013. This is best effort: a product without its
 * sample image is still a usable product, and setup must not fail because a
 * stock photo host was unreachable.
 */
const SEED_IMAGE_TIMEOUT_MS = 8000;

async function storeSeedImage(productId: string, sourceUrl: string) {
  try {
    // A stock photo host that accepts the connection and then stalls would
    // otherwise hold the setup request open until the Worker gives up, leaving
    // the completion marker unwritten.
    const response = await fetch(sourceUrl, {
      signal: AbortSignal.timeout(SEED_IMAGE_TIMEOUT_MS),
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "image/jpeg";
    const extension = ALLOWED_IMAGE_TYPES.get(contentType) ?? "jpg";
    const objectKey = `${PRODUCT_IMAGE_PREFIX}seed-${productId}.${extension}`;

    await env.BUCKET.put(objectKey, await response.arrayBuffer(), {
      httpMetadata: { contentType },
    });

    return objectKey;
  } catch {
    return null;
  }
}

export async function seedDatabase() {
  const db = getDb();

  await db.insert(categories).values(seedCategories).onConflictDoNothing();
  await db
    .insert(products)
    .values(
      seedProducts.map(({ sourceUrl: _sourceUrl, stock, ...product }) => ({
        ...product,
        availableStock: stock,
      }))
    )
    .onConflictDoNothing();

  const images = await Promise.all(
    seedProducts.map(async (product) => ({
      objectKey: await storeSeedImage(product.id, product.sourceUrl),
      product,
    }))
  );
  const stored = images.filter(
    (
      image
    ): image is { objectKey: string; product: (typeof seedProducts)[number] } =>
      image.objectKey !== null
  );

  if (stored.length > 0) {
    await db
      .insert(productImages)
      .values(
        stored.map(({ objectKey, product }) => ({
          alt: product.name,
          id: `${product.id}-image`,
          objectKey,
          productId: product.id,
        }))
      )
      .onConflictDoNothing();
  }

  return { images: stored.length, products: seedProducts.length };
}
