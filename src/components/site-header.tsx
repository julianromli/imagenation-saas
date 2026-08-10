import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, ShoppingBag, UserRound } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { useCart } from "@/components/cart-provider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  getLastOrderHintSnapshot,
  parseLastOrderHint,
  subscribeToLastOrderHint,
} from "@/lib/order-access";
import { cn } from "@/lib/utils";

/**
 * Counts a change to `count`, but only once the cart has hydrated and only
 * for changes the user caused. Returns a key that changes on every such
 * change, plus whether any change has happened yet. Remounting the badge on
 * the key replays its keyframe; withholding the class until the first real
 * change keeps the badge still on page load.
 */
function useCartCountChanges(count: number, hydrated: boolean) {
  const [changes, setChanges] = useState(0);
  const lastCount = useRef<number | null>(null);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    if (lastCount.current === null) {
      lastCount.current = count;
      return;
    }

    if (lastCount.current === count) {
      return;
    }

    lastCount.current = count;
    setChanges((current) => current + 1);
  }, [count, hydrated]);

  return changes;
}

const primaryNavItems = [
  { label: "Shop", to: "/products" },
  { label: "Find order", to: "/orders/find" },
  { label: "Orders", to: "/account/orders" },
  { label: "Admin", to: "/admin" },
] as const;

export function SiteHeader() {
  const { count, hydrated } = useCart();
  const countChanges = useCartCountChanges(count, hydrated);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const lastOrder = parseLastOrderHint(
    useSyncExternalStore(
      subscribeToLastOrderHint,
      getLastOrderHintSnapshot,
      () => null
    )
  );

  return (
    <header className="sticky top-0 z-40 border-border/70 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-20 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            className="group shrink-0 rounded-sm font-heading font-semibold text-xl tracking-[-0.06em] transition-[color,transform] duration-150 ease-out-quint hover:text-muted-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/"
          >
            then
            <span className="text-muted-foreground transition-colors group-hover:text-foreground">
              .
            </span>
            <span className="sr-only"> home</span>
          </Link>
          <span
            aria-hidden="true"
            className="hidden h-4 w-px bg-border sm:block"
          />
          <span className="hidden text-[10px] text-muted-foreground uppercase tracking-[0.18em] sm:block">
            considered goods
          </span>
        </div>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 rounded-full border border-border/70 bg-muted/40 p-1 text-muted-foreground text-sm lg:flex lg:justify-self-center"
        >
          {primaryNavItems.map((item) => (
            <Link
              className="rounded-full px-3 py-2 transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-background hover:text-foreground active:scale-[0.96] [&.active]:bg-foreground [&.active]:text-background"
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 lg:justify-self-end">
          {lastOrder ? (
            <a
              className="hidden min-h-11 items-center rounded-full px-3 text-muted-foreground text-sm transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-muted hover:text-foreground active:scale-[0.96] xl:inline-flex"
              href={lastOrder.orderStatusPath}
            >
              Continue order
              <ArrowUpRight aria-hidden="true" className="ml-1 size-3.5" />
            </a>
          ) : null}
          <Link
            aria-label="Open account"
            className="hidden size-11 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-muted hover:text-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:inline-flex"
            to="/account"
          >
            <UserRound aria-hidden="true" className="size-4" />
          </Link>
          <Link
            aria-label={`Cart with ${count} ${count === 1 ? "item" : "items"}`}
            className="group relative inline-flex size-11 items-center justify-center rounded-full border border-border transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-muted active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            to="/cart"
          >
            <ShoppingBag aria-hidden="true" className="size-4" />
            <span
              aria-hidden="true"
              className={cn(
                "absolute top-1 right-1 flex min-w-4 items-center justify-center rounded-full bg-foreground px-1 text-[10px] text-background tabular-nums leading-4",
                countChanges > 0 && "badge-pop"
              )}
              key={countChanges}
            >
              {count}
            </span>
          </Link>
          <Sheet onOpenChange={setMobileMenuOpen} open={mobileMenuOpen}>
            <SheetTrigger
              aria-label="Open navigation menu"
              className="inline-flex size-11 items-center justify-center rounded-full border border-border transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-muted active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring lg:hidden"
            >
              <Menu aria-hidden="true" className="size-4" />
            </SheetTrigger>
            <SheetContent
              className="w-full max-w-sm gap-0 bg-background p-0"
              side="right"
            >
              <SheetHeader className="border-border/70 border-b px-5 pt-6 pb-5 text-left">
                <SheetTitle className="text-left text-lg">Menu</SheetTitle>
                <SheetDescription className="text-left">
                  Find your way around then.
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col px-5 py-6">
                <nav aria-label="Mobile navigation" className="flex flex-col">
                  {primaryNavItems.map((item) => (
                    <Link
                      className="group flex min-h-14 items-center justify-between border-border/70 border-b font-heading text-2xl tracking-[-0.04em] transition-[color,transform] duration-150 ease-out-quint first:border-t hover:text-muted-foreground active:scale-[0.96] [&.active]:text-muted-foreground"
                      key={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      to={item.to}
                    >
                      {item.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-5 text-muted-foreground transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </Link>
                  ))}
                </nav>

                <div className="mt-8 grid gap-2">
                  <Link
                    className="flex min-h-12 items-center justify-between rounded-full bg-foreground px-5 text-background text-sm transition-[background-color,transform] duration-150 ease-out-quint hover:bg-foreground/80 active:scale-[0.96]"
                    onClick={() => setMobileMenuOpen(false)}
                    to="/account"
                  >
                    Account
                    <UserRound aria-hidden="true" className="size-4" />
                  </Link>
                  <Link
                    className="flex min-h-12 items-center justify-between rounded-full border border-border px-5 text-sm transition-[background-color,transform] duration-150 ease-out-quint hover:bg-muted active:scale-[0.96]"
                    onClick={() => setMobileMenuOpen(false)}
                    to="/cart"
                  >
                    Cart
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground tabular-nums">
                        {count} {count === 1 ? "item" : "items"}
                      </span>
                      <ShoppingBag aria-hidden="true" className="size-4" />
                    </span>
                  </Link>
                  {lastOrder ? (
                    <a
                      className="flex min-h-12 items-center justify-between rounded-full border border-border px-5 text-sm transition-[background-color,transform] duration-150 ease-out-quint hover:bg-muted active:scale-[0.96]"
                      href={lastOrder.orderStatusPath}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      Continue order
                      <ArrowUpRight aria-hidden="true" className="size-4" />
                    </a>
                  ) : null}
                </div>

                <p className="mt-auto pt-10 text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  Considered goods for everyday life.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
