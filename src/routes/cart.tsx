import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";

import { useCart } from "@/components/cart-provider";
import type { CatalogProduct } from "@/components/product-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { getProducts } from "@/lib/catalog.functions";
import { formatIdr } from "@/lib/format";

export const Route = createFileRoute("/cart")({
  component: CartPage,
  loader: () => getProducts({ data: {} }),
});

function CartPage() {
  const products = Route.useLoaderData() as CatalogProduct[];
  const { clear, lines, remove, setQuantity } = useCart();
  const productMap = new Map(products.map((product) => [product.id, product]));
  const items = lines
    .map((line) => ({ line, product: productMap.get(line.productId) }))
    .filter(
      (
        item
      ): item is {
        line: (typeof lines)[number];
        product: CatalogProduct;
      } => Boolean(item.product)
    );
  const subtotal = items.reduce(
    (total, { line, product }) => total + product.price * line.quantity,
    0
  );

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-5 pt-20 pb-32 text-center sm:px-8">
        <p className="text-muted-foreground text-sm">Your bag</p>
        <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
          Nothing here yet.
        </h1>
        <p className="mx-auto mt-5 max-w-md text-muted-foreground">
          Find something useful for the everyday and it will show up here.
        </p>
        <Link className={buttonVariants({ className: "mt-8" })} to="/products">
          Browse the collection
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pt-14 pb-20 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b pb-8">
        <div>
          <p className="text-muted-foreground text-sm">Your bag</p>
          <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
            Ready when you are.
          </h1>
        </div>
        <Button onClick={clear} variant="ghost">
          Clear bag
        </Button>
      </div>

      <div className="divide-y divide-border">
        {items.map(({ line, product }) => (
          <div
            className="flex gap-4 py-6 sm:items-center sm:gap-6"
            key={product.id}
          >
            <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-32">
              {product.imageUrl ? (
                <img
                  alt=""
                  className="size-full object-cover"
                  src={product.imageUrl}
                />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <Link
                className="font-medium hover:underline"
                params={{ slug: product.slug }}
                to="/products/$slug"
              >
                {product.name}
              </Link>
              <p className="mt-1 text-muted-foreground text-sm">
                {formatIdr(product.price)}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button
                  aria-label={`Decrease ${product.name} quantity`}
                  disabled={line.quantity <= 1}
                  onClick={() => setQuantity(product.id, line.quantity - 1)}
                  size="icon-sm"
                  variant="outline"
                >
                  <Minus aria-hidden="true" />
                </Button>
                <span className="w-6 text-center text-sm tabular-nums">
                  {line.quantity}
                </span>
                <Button
                  aria-label={`Increase ${product.name} quantity`}
                  disabled={line.quantity >= product.availableStock}
                  onClick={() => setQuantity(product.id, line.quantity + 1)}
                  size="icon-sm"
                  variant="outline"
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <p className="font-medium text-sm">
                {formatIdr(product.price * line.quantity)}
              </p>
              <Button
                aria-label={`Remove ${product.name}`}
                onClick={() => remove(product.id)}
                size="icon-sm"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 ml-auto max-w-sm border-t pt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span className="font-medium">{formatIdr(subtotal)}</span>
        </div>
        <p className="mt-3 text-muted-foreground text-xs leading-5">
          Flat-rate shipping is calculated at checkout.
        </p>
        <Link
          className={buttonVariants({ className: "mt-6 w-full" })}
          to="/checkout"
        >
          Continue to checkout
        </Link>
      </div>
    </main>
  );
}
