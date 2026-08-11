import { createFileRoute } from "@tanstack/react-router";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminStats } from "@/lib/admin.functions";
import { formatIdr } from "@/lib/format";
import { PLANNING_USD_TO_IDR } from "@/lib/pricing";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  loader: () => getAdminStats(),
});

function AdminOverview() {
  const stats = Route.useLoaderData();
  const margin =
    stats.revenueIdrLast30Days > 0
      ? Math.round(
          ((stats.revenueIdrLast30Days - stats.upstreamCostIdrLast30Days) /
            stats.revenueIdrLast30Days) *
            100
        )
      : null;

  const cards = [
    { label: "Accounts", value: String(stats.users) },
    { label: "Credits outstanding", value: String(stats.creditsOutstanding) },
    { label: "Images, 30 days", value: String(stats.madeLast30Days) },
    { label: "Failures, 30 days", value: String(stats.failedLast30Days) },
    {
      label: "Revenue, 30 days",
      value: formatIdr(stats.revenueIdrLast30Days),
    },
    {
      label: "Image cost, 30 days",
      value: formatIdr(stats.upstreamCostIdrLast30Days),
    },
  ];

  return (
    <section>
      <p className="text-muted-foreground text-sm">Overview</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        Where the money is going.
      </h2>

      {stats.stuckGenerations > 0 ? (
        <Alert className="mt-6" variant="destructive">
          <AlertTitle>
            {stats.stuckGenerations} generations have been pending for over half
            an hour.
          </AlertTitle>
          <AlertDescription>
            The five-minute cron refunds these, so if this number is not
            falling, the cron is not running.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Card key={card.label} size="sm">
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl tracking-[-0.04em] tabular-nums">
                {card.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="mt-8 rounded-3xl border p-6 text-sm leading-6">
        <p className="font-medium">Margin</p>
        <p className="mt-2 text-muted-foreground">
          {margin === null
            ? "No paid purchases in the last 30 days, so there is nothing to compare against yet."
            : `Roughly ${margin}% gross over the last 30 days, counting only what OpenRouter charged (${stats.upstreamCostUsdLast30Days.toFixed(2)} USD at ${PLANNING_USD_TO_IDR.toLocaleString("en-ID")} per USD).`}
        </p>
        <p className="mt-3 text-muted-foreground">
          Revenue is counted when a purchase is paid, and image cost when an
          image is made. Those do not line up inside one window: credits bought
          this month may be spent next. Read the trend, not the day.
        </p>
      </div>
    </section>
  );
}
