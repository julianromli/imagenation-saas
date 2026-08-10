import { Link } from "@tanstack/react-router";

/**
 * Deliberately slim. This is a tool, and the page below the fold belongs to
 * the work, not to a sitemap.
 */
const footerLinks = [
  { label: "Privacy", to: "/legal/privacy" },
  { label: "Terms", to: "/legal/terms" },
  { label: "Refunds", to: "/legal/refund" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-border/70 border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-6 text-muted-foreground text-xs sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <p>© {new Date().getFullYear()} Imagenation</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
          {footerLinks.map((link) => (
            <Link
              className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
              key={link.to}
              to={link.to}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
