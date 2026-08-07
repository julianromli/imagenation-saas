import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { useState } from "react";

import { useCart } from "@/components/cart-provider";
import { Button } from "@/components/ui/button";
import { getProductBySlug } from "@/lib/catalog.functions";
import { formatIdr } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { cn } from "@/lib/utils";

type ProductDetail = {
  availableStock: number;
  categoryName: string | null;
  description: string;
  id: string;
  imageObjectKey: string | null;
  name: string;
  price: number;
  slug: string;
};

export const Route = createFileRoute("/products/$slug")({
  component: ProductPage,
  loader: ({ params }) => getProductBySlug({ data: params.slug }),
});

function ProductPage() {
  const product = Route.useLoaderData() as ProductDetail;
  const { add } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const imageUrl = productImageUrl(product.imageObjectKey);

  function addProduct() {
    add({ productId: product.id, quantity });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <main className="mx-auto max-w-7xl px-5 pt-8 pb-20 sm:px-8">
      <Link
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        to="/products"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to collection
      </Link>

      <div className="mt-8 grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-16">
        <div className="aspect-[4/5] overflow-hidden rounded-[2rem] bg-muted">
          {imageUrl ? (
            <img
              alt={product.name}
              className="size-full object-cover"
              src={imageUrl}
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>

        <div className="flex flex-col justify-center">
          <p className="text-muted-foreground text-sm">
            {product.categoryName ?? "Collection"}
          </p>
          <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
            {product.name}
          </h1>
          <p className="mt-5 font-medium text-lg">{formatIdr(product.price)}</p>
          <p className="mt-6 max-w-lg text-base text-muted-foreground leading-7">
            {product.description}
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <fieldset className="inline-flex h-11 items-center rounded-full border">
              <legend className="sr-only">Quantity</legend>
              <Button
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() =>
                  setQuantity((current) => Math.max(1, current - 1))
                }
                size="icon"
                variant="ghost"
              >
                <Minus aria-hidden="true" />
              </Button>
              <span className="w-8 text-center text-sm tabular-nums">
                {quantity}
              </span>
              <Button
                aria-label="Increase quantity"
                disabled={quantity >= Math.min(99, product.availableStock)}
                onClick={() =>
                  setQuantity((current) =>
                    Math.min(99, product.availableStock, current + 1)
                  )
                }
                size="icon"
                variant="ghost"
              >
                <Plus aria-hidden="true" />
              </Button>
            </fieldset>
            <Button
              className="h-11 rounded-full px-6"
              disabled={product.availableStock < 1}
              onClick={addProduct}
            >
              <span className="relative size-4">
                <Plus
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 size-4 transition-[filter,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
                    added
                      ? "scale-[0.25] opacity-0 blur-[4px]"
                      : "scale-100 opacity-100 blur-0"
                  )}
                />
                <Check
                  aria-hidden="true"
                  className={cn(
                    "absolute inset-0 size-4 transition-[filter,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
                    added
                      ? "scale-100 opacity-100 blur-0"
                      : "scale-[0.25] opacity-0 blur-[4px]"
                  )}
                />
              </span>
              {added ? "Added to cart" : "Add to cart"}
            </Button>
          </div>
          <p className="mt-3 text-muted-foreground text-sm">
            {product.availableStock > 0
              ? `${product.availableStock} available`
              : "Currently out of stock"}
          </p>
          <div aria-live="polite" className="sr-only">
            {added ? `${product.name} added to cart` : ""}
          </div>
        </div>
      </div>
    </main>
  );
}
