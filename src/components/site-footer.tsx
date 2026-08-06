import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-border/70 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-10 text-muted-foreground text-sm sm:px-8 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-heading font-semibold text-base text-foreground">
            then.
          </p>
          <p className="mt-2 max-w-xs leading-6">
            Considered goods for everyday life. Built as a ready-to-rebrand
            storefront.
          </p>
        </div>
        <nav
          aria-label="Footer navigation"
          className="flex flex-wrap gap-x-5 gap-y-3"
        >
          <Link className="hover:text-foreground" to="/legal/privacy">
            Privacy
          </Link>
          <Link className="hover:text-foreground" to="/legal/terms">
            Terms
          </Link>
          <Link className="hover:text-foreground" to="/legal/shipping">
            Shipping
          </Link>
          <Link className="hover:text-foreground" to="/legal/refund">
            Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
