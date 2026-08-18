import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getAdminStats } from "@/lib/admin.functions";
import { formatIdr } from "@/lib/format";
import {
  dismissAppOnboarding,
  getAppOnboarding,
} from "@/lib/onboarding.functions";
import { PLANNING_USD_TO_IDR } from "@/lib/pricing";
import { setupGuideSteps } from "@/lib/setup-guide";

export const Route = createFileRoute("/admin/")({
  component: AdminOverview,
  loader: async () => {
    const [onboarding, stats] = await Promise.all([
      getAppOnboarding(),
      getAdminStats(),
    ]);

    return { onboarding, stats };
  },
});

function stepIsDone(
  id: (typeof setupGuideSteps)[number]["id"],
  onboarding: { livePayments: boolean; publicUrl: boolean }
) {
  if (id === "administrator") {
    return true;
  }

  if (id === "public-url") {
    return onboarding.publicUrl;
  }

  if (id === "production-key") {
    return onboarding.livePayments;
  }

  return false;
}

function AdminOverview() {
  const { onboarding, stats } = Route.useLoaderData();
  const router = useRouter();
  const [hiding, setHiding] = useState(false);
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

  async function hideGuide() {
    setHiding(true);

    try {
      await dismissAppOnboarding();
      await router.invalidate();
    } finally {
      setHiding(false);
    }
  }

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

      {onboarding.dismissed ? null : (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Finish your app</CardTitle>
            <CardDescription>
              These steps stay here, not on the public site. Hide the guide when
              you are done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-6">
              {setupGuideSteps.map((step, index) => {
                const done = stepIsDone(step.id, onboarding);

                return (
                  <li className="flex gap-4" key={step.id}>
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-xs"
                    >
                      {done ? (
                        <Check aria-hidden="true" className="size-3.5" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        {step.title}
                        {step.optional ? (
                          <span className="ml-2 font-normal text-muted-foreground text-xs">
                            Optional
                          </span>
                        ) : null}
                        {done ? (
                          <span className="ml-2 font-normal text-muted-foreground text-xs">
                            Done
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1.5 text-muted-foreground text-sm leading-6">
                        {step.body}
                      </p>
                      {step.id === "webhook" && onboarding.webhookUrl ? (
                        <code className="mt-3 block overflow-x-auto rounded-2xl bg-muted p-3 text-xs">
                          {onboarding.webhookUrl}
                        </code>
                      ) : null}
                      {step.to ? (
                        <Link
                          className="mt-2.5 inline-flex text-sm underline-offset-4 hover:underline"
                          to={step.to}
                        >
                          Open credits
                        </Link>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
            <Button
              className="mt-8"
              disabled={hiding}
              onClick={hideGuide}
              type="button"
              variant="outline"
            >
              Hide setup guide
            </Button>
          </CardContent>
        </Card>
      )}

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
