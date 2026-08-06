import { Link } from "@tanstack/react-router";
import { Check, Plus } from "lucide-react";
import { useState } from "react";

import { useCart } from "@/components/cart-provider";
import { Button } from "@/components/ui/button";
import { formatIdr } from "@/lib/format";

export type CatalogProduct = {
  availableStock: number;
  categoryName: string | null;
  currency: string;
  description: string;
  id: string;
  imageUrl: string | null;
  name: string;
  price: number;
  slug: string;
};

export function ProductCard({ product }: { product: CatalogProduct }) {
  const { add } = useCart();
  const [added, setAdded] = useState(false);

  function addToCart() {
    add({ productId: product.id, quantity: 1 });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <article className="group flex flex-col">
      <Link
        aria-label={`View ${product.name}`}
        className="relative aspect-[4/5] overflow-hidden rounded-[1.75rem] bg-muted"
        params={{ slug: product.slug }}
        to="/products/$slug"
      >
        {product.imageUrl ? (
          <img
            alt=""
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
            loading="lazy"
            src={product.imageUrl}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground text-sm">
            No image
          </div>
        )}
        <span className="absolute top-4 left-4 rounded-full bg-background/85 px-3 py-1 text-muted-foreground text-xs backdrop-blur">
          {product.categoryName ?? "Collection"}
        </span>
      </Link>

      <div className="flex items-start justify-between gap-4 px-1 pt-4">
        <div className="min-w-0">
          <Link
            className="font-medium tracking-[-0.01em] hover:underline"
            params={{ slug: product.slug }}
            to="/products/$slug"
          >
            {product.name}
          </Link>
          <p className="mt-1 line-clamp-2 text-muted-foreground text-sm leading-6">
            {product.description}
          </p>
          <p className="mt-2 font-medium text-sm">{formatIdr(product.price)}</p>
        </div>
        <Button
          aria-label={`Add ${product.name} to cart`}
          className="mt-0.5 size-10 rounded-full"
          disabled={product.availableStock < 1}
          onClick={addToCart}
          size="icon"
          variant={added ? "secondary" : "outline"}
        >
          {added ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
        </Button>
      </div>
      <div aria-live="polite" className="sr-only">
        {added ? `${product.name} added to cart` : ""}
      </div>
    </article>
  );
}
