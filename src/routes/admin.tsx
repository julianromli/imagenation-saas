import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { LayoutDashboard, Package, ShoppingCart, Tags } from "lucide-react";

import { ensureAdmin } from "@/lib/auth.functions";

const adminNavItems = [
  // Overview matches exactly. Without it, "/admin" counts as active on every
  // page below it and the whole nav reads as selected.
  { exact: true, icon: LayoutDashboard, label: "Overview", to: "/admin" },
  { exact: false, icon: Package, label: "Products", to: "/admin/products" },
  { exact: false, icon: Tags, label: "Categories", to: "/admin/categories" },
  { exact: false, icon: ShoppingCart, label: "Orders", to: "/admin/orders" },
] as const;

export const Route = createFileRoute("/admin")({
  beforeLoad: async () => {
    try {
      return { session: await ensureAdmin() };
    } catch {
      // biome-ignore lint/style/useErrorCause: TanStack redirect is the intended control flow.
      throw redirect({ to: "/sign-in" });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-10 px-5 pt-10 pb-20 sm:px-8 lg:flex-row">
      <aside className="lg:w-56 lg:shrink-0">
        <p className="text-muted-foreground text-sm">Workspace</p>
        <h1 className="mt-2 font-heading font-medium text-3xl tracking-[-0.05em]">
          Admin
        </h1>
        <nav aria-label="Admin navigation" className="mt-7 grid gap-1">
          {adminNavItems.map(({ exact, icon: Icon, label, to }) => (
            <Link
              activeOptions={{ exact }}
              className="inline-flex min-h-11 items-center gap-3 rounded-xl px-3 text-muted-foreground text-sm transition-colors hover:bg-muted hover:text-foreground [&.active]:bg-muted [&.active]:text-foreground"
              key={to}
              to={to}
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </main>
  );
}
