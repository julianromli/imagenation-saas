import { createFileRoute } from "@tanstack/react-router";
import { Activity, PackageCheck, ShoppingCart } from "lucide-react";

import { getAdminStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  loader: () => getAdminStats(),
});

function AdminOverview() {
  const stats = Route.useLoaderData();

  return (
    <section>
      <p className="text-muted-foreground text-sm">Overview</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        A clear view of the shop.
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={<PackageCheck aria-hidden="true" />}
          label="Active products"
          value={stats.activeProducts}
        />
        <StatCard
          icon={<ShoppingCart aria-hidden="true" />}
          label="Total orders"
          value={stats.totalOrders}
        />
        <StatCard
          icon={<Activity aria-hidden="true" />}
          label="Payment source"
          value="Mayar"
        />
      </div>
      <div className="mt-8 rounded-3xl border p-6">
        <h3 className="font-medium">Operational notes</h3>
        <ul className="mt-4 grid gap-3 text-muted-foreground text-sm leading-6">
          <li>Payment status is confirmed by Mayar webhooks and API resync.</li>
          <li>Inventory reservations expire after 30 minutes.</li>
          <li>Refunds are marked here after completing them in Mayar.</li>
        </ul>
      </div>
    </section>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-3xl border p-5">
      <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted [&_svg]:size-4">
        {icon}
      </span>
      <p className="mt-7 text-muted-foreground text-sm">{label}</p>
      <p className="mt-1 font-medium text-3xl tracking-[-0.04em]">{value}</p>
    </div>
  );
}
