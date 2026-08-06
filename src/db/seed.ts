import { getDb } from "@/db";
import { categories, productImages, products } from "@/db/schema";

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
    stock: 24,
    url: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&w=1200&q=85",
  },
  {
    categoryId: "category-home",
    description:
      "A warm ceramic cup with a comfortable handle for slow mornings and long afternoons.",
    id: "product-stoneware-cup",
    name: "Stoneware cup",
    price: 125_000,
    slug: "stoneware-cup",
    stock: 18,
    url: "https://images.unsplash.com/photo-1514228742587-6b1558fcca3d?auto=format&fit=crop&w=1200&q=85",
  },
  {
    categoryId: "category-home",
    description:
      "A soft, textured throw that adds a quiet layer of comfort to your favorite chair.",
    id: "product-textured-throw",
    name: "Textured throw",
    price: 349_000,
    slug: "textured-throw",
    stock: 12,
    url: "https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=1200&q=85",
  },
  {
    categoryId: "category-everyday",
    description:
      "A clean-lined bottle built for desks, commutes, and the space between both.",
    id: "product-desk-bottle",
    name: "Desk bottle",
    price: 219_000,
    slug: "desk-bottle",
    stock: 30,
    url: "https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1200&q=85",
  },
];

export async function seedDatabase() {
  const db = getDb();

  await db.insert(categories).values(seedCategories).onConflictDoNothing();
  await db
    .insert(products)
    .values(
      seedProducts.map(({ stock, url, ...product }) => ({
        ...product,
        availableStock: stock,
      }))
    )
    .onConflictDoNothing();
  await db
    .insert(productImages)
    .values(
      seedProducts.map(({ id, name, url }) => ({
        alt: name,
        id: `${id}-image`,
        productId: id,
        url,
      }))
    )
    .onConflictDoNothing();
}
