import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { useCartProducts } from "@/hooks/use-cart-products";
import { formatIdr } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { EXIT_DURATION_MS, prefersReducedMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/cart")({
  component: CartPage,
});

/**
 * A value derived from the cart, such as a line total. It settles into its new
 * number so the eye is drawn to what the last click actually changed. It stays
 * still until `animate` turns on, so nothing moves on page load.
 */
function DerivedAmount({
  animate,
  className,
  value,
}: {
  animate: boolean;
  className?: string;
  value: string;
}) {
  return (
    <span className={cn(className, animate && "bump-in")} key={value}>
      {value}
    </span>
  );
}

function CartPage() {
  const { clear, remove, setQuantity } = useCart();
  const { error, items, loading, retry, subtotal } = useCartProducts();
  const [leaving, setLeaving] = useState<string[]>([]);
  const [changedByUser, setChangedByUser] = useState(false);
  const exitTimers = useRef<number[]>([]);

  useEffect(
    () => () => {
      for (const timer of exitTimers.current) {
        window.clearTimeout(timer);
      }
    },
    []
  );

  function afterExit(commit: () => void) {
    const timer = window.setTimeout(() => {
      commit();
      exitTimers.current = exitTimers.current.filter((id) => id !== timer);
    }, EXIT_DURATION_MS);

    exitTimers.current.push(timer);
  }

  function changeQuantity(productId: string, quantity: number) {
    setChangedByUser(true);
    setQuantity(productId, quantity);
  }

  function removeItem(productId: string) {
    setChangedByUser(true);

    if (prefersReducedMotion()) {
      remove(productId);
      return;
    }

    // A second click inside the exit window must not queue a second timer.
    if (leaving.includes(productId)) {
      return;
    }

    setLeaving((current) => [...current, productId]);
    afterExit(() => {
      remove(productId);
      setLeaving((current) => current.filter((id) => id !== productId));
    });
  }

  function clearCart() {
    setChangedByUser(true);

    if (prefersReducedMotion()) {
      clear();
      return;
    }

    setLeaving(items.map(({ product }) => product.id));
    afterExit(() => {
      clear();
      setLeaving([]);
    });
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          Could not load your bag.
        </h1>
        <p className="mt-4 text-muted-foreground text-sm">{error}</p>
        <p className="mt-2 text-muted-foreground text-sm">
          Your items are still saved on this device.
        </p>
        <Button className="mt-8 rounded-full" onClick={retry} type="button">
          Try again
        </Button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-5 pt-20 pb-32 text-center sm:px-8">
        <p className="text-muted-foreground text-sm">Loading your bag</p>
      </main>
    );
  }

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
        <Button onClick={clearCart} variant="ghost">
          Clear bag
        </Button>
      </div>

      <div className="divide-y divide-border">
        {items.map(({ line, product }) => (
          <div
            className="flex gap-4 py-6 transition-[opacity,transform] duration-150 ease-in data-leaving:pointer-events-none data-leaving:-translate-y-2 data-leaving:opacity-0 sm:items-center sm:gap-6"
            data-leaving={leaving.includes(product.id) ? "" : undefined}
            key={product.id}
          >
            <div className="size-24 shrink-0 overflow-hidden rounded-2xl bg-muted sm:size-32">
              {productImageUrl(product.imageObjectKey) ? (
                <img
                  alt=""
                  className="size-full object-cover"
                  src={productImageUrl(product.imageObjectKey) ?? ""}
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
                  onClick={() => changeQuantity(product.id, line.quantity - 1)}
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
                  onClick={() => changeQuantity(product.id, line.quantity + 1)}
                  size="icon-sm"
                  variant="outline"
                >
                  <Plus aria-hidden="true" />
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <DerivedAmount
                animate={changedByUser}
                className="font-medium text-sm"
                value={formatIdr(product.price * line.quantity)}
              />
              <Button
                aria-label={`Remove ${product.name}`}
                onClick={() => removeItem(product.id)}
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
          <DerivedAmount
            animate={changedByUser}
            className="font-medium"
            value={formatIdr(subtotal)}
          />
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
