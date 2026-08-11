import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Spinner } from "@/components/ui/spinner";
import { listAllPurchases, recheckPurchase } from "@/lib/admin.functions";
import { formatIdr, formatMoment } from "@/lib/format";

export const Route = createFileRoute("/admin/purchases")({
  component: AdminPurchases,
  loader: () => listAllPurchases(),
});

function AdminPurchases() {
  const purchases = Route.useLoaderData();

  return (
    <section>
      <p className="text-muted-foreground text-sm">Purchases</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        Every credit pack sold.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
        Re-check reads the transaction back from Mayar and settles it if it is
        paid. It runs the same code as the webhook, so it cannot grant credits a
        second time.
      </p>

      {purchases.length === 0 ? (
        <Empty className="mt-8 border">
          <EmptyHeader>
            <EmptyTitle>Nobody has bought credits yet.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="mt-8 divide-y rounded-3xl border">
          {purchases.map((purchase) => (
            <PurchaseRow key={purchase.id} purchase={purchase} />
          ))}
        </ul>
      )}
    </section>
  );
}

type PurchaseRowProps = {
  purchase: {
    amount: number;
    createdAt: number;
    credits: number;
    email: string;
    id: string;
    invoiceId: string | null;
    reference: string;
    status: string;
    transactionId: string | null;
  };
};

function PurchaseRow({ purchase }: PurchaseRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function recheck() {
    setBusy(true);

    try {
      await recheckPurchase({ data: purchase.id });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
      <span className="min-w-0">
        <span className="block truncate font-medium text-sm">
          {purchase.reference} · {formatIdr(purchase.amount)} ·{" "}
          <span className="tabular-nums">{purchase.credits}</span> credits
        </span>
        <span className="block truncate text-muted-foreground text-xs">
          {purchase.email} · {formatMoment(purchase.createdAt)}
          {purchase.transactionId ? ` · tx ${purchase.transactionId}` : ""}
        </span>
      </span>
      <span className="flex items-center gap-4">
        <span className="text-sm capitalize">{purchase.status}</span>
        {purchase.status === "pending" ? (
          <Button
            className="min-h-9 rounded-full"
            disabled={busy}
            onClick={recheck}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy ? <Spinner data-icon="inline-start" /> : null}
            Re-check
          </Button>
        ) : null}
      </span>
    </li>
  );
}
