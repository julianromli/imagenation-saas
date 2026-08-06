import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ShoppingBag } from "lucide-react";
import { useEffect, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { getLastOrderHint, type LastOrderHint } from "@/lib/order-access";

export function SiteHeader() {
  const { count } = useCart();
  const [lastOrder, setLastOrder] = useState<LastOrderHint | null>(null);

  useEffect(() => {
    setLastOrder(getLastOrderHint());
  }, []);

  return (
    <header className="border-border/70 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex min-h-18 w-full max-w-7xl items-center justify-between gap-6 px-5 sm:px-8">
        <Link
          className="font-heading font-semibold text-lg tracking-[-0.03em]"
          to="/"
        >
          then<span className="text-muted-foreground">.</span>
          <span className="sr-only"> home</span>
        </Link>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-6 text-muted-foreground text-sm md:flex"
        >
          <Link
            className="transition-colors hover:text-foreground [&.active]:text-foreground"
            to="/products"
          >
            Shop
          </Link>
          <Link
            className="transition-colors hover:text-foreground [&.active]:text-foreground"
            to="/orders/find"
          >
            Find order
          </Link>
          <Link
            className="transition-colors hover:text-foreground [&.active]:text-foreground"
            to="/account/orders"
          >
            Orders
          </Link>
          <Link
            className="transition-colors hover:text-foreground [&.active]:text-foreground"
            to="/admin"
          >
            Admin
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {lastOrder ? (
            <a
              className="hidden min-h-11 items-center rounded-full px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
              href={lastOrder.orderStatusPath}
            >
              Continue order
            </a>
          ) : null}
          <Link
            aria-label={`Cart with ${count} ${count === 1 ? "item" : "items"}`}
            className="group inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm transition-colors hover:bg-muted"
            to="/cart"
          >
            <ShoppingBag aria-hidden="true" className="size-4" />
            <span className="tabular-nums">{count}</span>
          </Link>
          <Link
            aria-label="Open account"
            className="hidden min-h-11 items-center gap-1 rounded-full px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground sm:inline-flex"
            to="/account"
          >
            Account
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
