import { useCallback, useEffect, useState } from "react";

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
  // A primitive dependency, so the loader is rebuilt when the cart contents
  // change rather than on every render that rebuilds the array.
  const idKey = [...new Set(lines.map((line) => line.productId))]
    .sort()
    .join(",");
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared by the effect and by the retry action, so a manual retry runs the
  // same request rather than nudging a counter the effect watches.
  const load = useCallback(() => {
    const ids = idKey ? idKey.split(",") : [];
    let cancelled = false;

    if (ids.length === 0) {
      setProducts([]);
      setError(null);
      setLoading(false);

      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    getProductsByIds({ data: { ids } })
      .then((rows) => {
        if (!cancelled) {
          setProducts(rows);
        }
      })
      .catch((requestError: unknown) => {
        if (cancelled) {
          return;
        }

        // A failed lookup is not an empty cart. Saying so would invite the
        // buyer to rebuild a cart that is still there.
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load your bag"
        );
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

  useEffect(() => load(), [load]);

  const productById = new Map(products.map((product) => [product.id, product]));
  const items = lines.flatMap((line) => {
    const product = productById.get(line.productId);

    return product ? [{ line, product }] : [];
  });
  const subtotal = items.reduce(
    (total, { line, product }) => total + product.price * line.quantity,
    0
  );

  return {
    error,
    items,
    loading,
    retry: load,
    subtotal,
  };
}
