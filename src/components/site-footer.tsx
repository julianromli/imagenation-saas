import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

const footerLinkGroups = [
  {
    label: "Explore",
    links: [
      { label: "Shop", to: "/products" },
      { label: "Find order", to: "/orders/find" },
    ],
  },
  {
    label: "Account",
    links: [
      { label: "Account", to: "/account" },
      { label: "Order history", to: "/account/orders" },
      { label: "Cart", to: "/cart" },
    ],
  },
  {
    label: "Help",
    links: [
      { label: "Shipping", to: "/legal/shipping" },
      { label: "Refunds", to: "/legal/refund" },
    ],
  },
  {
    label: "Legal",
    links: [
      { label: "Privacy", to: "/legal/privacy" },
      { label: "Terms", to: "/legal/terms" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="mt-24 overflow-hidden bg-foreground text-background">
      <div className="mx-auto max-w-7xl px-5 pt-14 sm:px-8 sm:pt-20">
        <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_1.5fr] lg:gap-20">
          <div>
            <p className="text-background/55 text-xs uppercase tracking-[0.18em]">
              then.
            </p>
            <h2 className="mt-5 max-w-xl font-heading font-medium text-4xl tracking-[-0.06em] sm:text-5xl">
              Considered goods for everyday life.
            </h2>
            <p className="mt-6 max-w-sm text-background/60 text-sm leading-6">
              A focused storefront for things worth making room for.
            </p>
          </div>

          <nav
            aria-label="Footer navigation"
            className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4"
          >
            {footerLinkGroups.map((group) => (
              <div key={group.label}>
                <p className="text-background/45 text-xs uppercase tracking-[0.16em]">
                  {group.label}
                </p>
                <div className="mt-5 flex flex-col items-start gap-3">
                  {group.links.map((link) => (
                    <Link
                      className="group inline-flex items-center gap-1 text-background/70 text-sm transition-[color,transform] duration-150 ease-out-quint hover:text-background active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-background"
                      key={link.to}
                      to={link.to}
                    >
                      {link.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-3.5 -translate-x-0.5 translate-y-0.5 opacity-0 transition-[opacity,transform] duration-150 ease-out-quint group-hover:translate-x-0 group-hover:translate-y-0 group-hover:opacity-100"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-16 flex flex-col gap-4 border-background/15 border-t py-5 text-background/45 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} then. All rights reserved.</p>
          <p>Made for everyday living.</p>
        </div>

        <div
          aria-hidden="true"
          className="-mb-2 flex w-full items-baseline justify-between font-heading font-medium text-[clamp(7rem,22vw,18rem)] text-background/10 leading-[0.68]"
        >
          <span>t</span>
          <span>h</span>
          <span>e</span>
          <span>n</span>
        </div>
      </div>
    </footer>
  );
}
