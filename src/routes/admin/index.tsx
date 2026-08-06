import { createFileRoute } from "@tanstack/react-router";
import { Activity, PackageCheck, ShoppingCart } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAdminStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  loader: () => getAdminStats(),
});

function AdminOverview() {
  const stats = Route.useLoaderData();
  const statCards = [
    {
      icon: PackageCheck,
      label: "Active products",
      value: stats.activeProducts,
    },
    { icon: ShoppingCart, label: "Total orders", value: stats.totalOrders },
    { icon: Activity, label: "Payment source", value: "Mayar" },
  ];

  return (
    <section>
      <p className="text-muted-foreground text-sm">Overview</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        A clear view of the shop.
      </h2>
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        {statCards.map(({ icon: Icon, label, value }) => (
          <Card
            className="rounded-3xl border bg-transparent p-5 shadow-none ring-0"
            key={label}
          >
            <span className="inline-flex size-9 items-center justify-center rounded-xl bg-muted [&_svg]:size-4">
              <Icon aria-hidden="true" />
            </span>
            <p className="mt-7 text-muted-foreground text-sm">{label}</p>
            <p className="mt-1 font-medium text-3xl tracking-[-0.04em]">
              {value}
            </p>
          </Card>
        ))}
      </div>
      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Operational notes</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <ul className="grid gap-3 text-muted-foreground text-sm leading-6">
            <li>
              Payment status is confirmed by Mayar webhooks and API resync.
            </li>
            <li>Inventory reservations expire after 30 minutes.</li>
            <li>Refunds are marked here after completing them in Mayar.</li>
          </ul>
        </CardContent>
      </Card>
    </section>
  );
}
