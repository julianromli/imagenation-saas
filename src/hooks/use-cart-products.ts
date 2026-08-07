import { useEffect, useState } from "react";

import { useCart } from "@/components/cart-provider";
import type { CatalogProductRow } from "@/lib/catalog.functions";
import { getProductsByIds } from "@/lib/catalog.functions";

/**
 * Resolves the products the cart refers to.
 *
 * The cart lives in the browser, so a route loader cannot know which products
 * to fetch. Asking for the cart's own product IDs keeps a cart page from
 * pulling the whole catalogue.
 */
export function useCartProducts() {
  const { lines } = useCart();
  // A primitive dependency, so the effect reruns when the cart contents change
  // rather than on every render that rebuilds the array.
  const idKey = [...new Set(lines.map((line) => line.productId))]
    .sort()
    .join(",");
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];

    if (ids.length === 0) {
      setProducts([]);
      setLoading(false);

      return;
    }

    let cancelled = false;

    setLoading(true);
    getProductsByIds({ data: { ids } })
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setProducts([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const items = lines.flatMap((line) => {
    const product = productById.get(line.productId);

    return product ? [{ line, product }] : [];
  });
  const subtotal = items.reduce(
    (total, { line, product }) => total + product.price * line.quantity,
    0
  );

  return { items, loading, subtotal };
}
