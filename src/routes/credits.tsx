import {
  createFileRoute,
  getRouteApi,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { listCreditHistory } from "@/lib/credits.functions";
import { formatDelta, formatIdr, formatMoment } from "@/lib/format";
import { CREDIT_PACKS, idrPerCredit, RESOLUTION_TIERS } from "@/lib/pricing";
import {
  listPurchases,
  refreshPurchase,
  startPurchase,
} from "@/lib/purchase.functions";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/credits")({
  component: CreditsPage,
  head: () => ({
    meta: [{ title: "Credits — Imagenation" }],
  }),
  loader: async () => {
    const [entries, purchases] = await Promise.all([
      listCreditHistory().catch(() => null),
      listPurchases().catch(() => []),
    ]);

    return { entries, purchases };
  },
});

function CreditsPage() {
  const { entries, purchases } = Route.useLoaderData();
  const { balance, signedIn } = rootApi.useLoaderData();

  return (
    <main className="mx-auto max-w-4xl px-5 pt-12 pb-24 sm:px-8">
      <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
        Credits
      </h1>
      {signedIn ? (
        <p className="mt-3 text-muted-foreground text-sm">
          You have{" "}
          <span className="font-medium text-foreground tabular-nums">
            {balance}
          </span>{" "}
          {balance === 1 ? "credit" : "credits"}.
        </p>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm">
          <Link className="underline underline-offset-4" to="/auth">
            Sign in
          </Link>{" "}
          to buy credits.
        </p>
      )}

      <section className="mt-10">
        <h2 className="text-muted-foreground text-sm">What an image costs</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {RESOLUTION_TIERS.map((tier) => (
            <li className="rounded-2xl border px-4 py-3 text-sm" key={tier.id}>
              <p className="font-medium">
                {tier.label} ·{" "}
                <span className="tabular-nums">{tier.credits}</span>{" "}
                {tier.credits === 1 ? "credit" : "credits"}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {tier.sampleDimensions} at 16:9 · about {tier.typicalSeconds}s
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-muted-foreground text-xs">
          Reference images are free. A failed image returns its credits; a
          prompt blocked for content does not.
        </p>
      </section>

      <PackList signedIn={signedIn} />

      {purchases.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-muted-foreground text-sm">Purchases</h2>
          <ul className="mt-3 divide-y rounded-3xl border">
            {purchases.map((purchase) => (
              <PurchaseRow key={purchase.id} purchase={purchase} />
            ))}
          </ul>
        </section>
      ) : null}

      {entries && entries.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-muted-foreground text-sm">Credit history</h2>
          <ul className="mt-3 divide-y rounded-3xl border">
            {entries.map((entry) => (
              <li
                className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
                key={entry.id}
              >
                <span>
                  <span className="capitalize">{entry.reason}</span>
                  {entry.note ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {entry.note}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-4">
                  <span className="text-muted-foreground text-xs">
                    {formatMoment(entry.createdAt)}
                  </span>
                  <span className="w-12 text-right font-medium tabular-nums">
                    {formatDelta(entry.delta)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function PackList({ signedIn }: { signedIn: boolean }) {
  const [mobile, setMobile] = useState("");
  const [pendingPack, setPendingPack] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function buy(packId: string) {
    setError("");
    setPendingPack(packId);

    try {
      const { paymentUrl } = await startPurchase({ data: { mobile, packId } });

      window.location.href = paymentUrl;
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to start the payment"
      );
      setPendingPack(null);
    }
  }

  return (
    <section className="mt-12">
      <h2 className="text-muted-foreground text-sm">Buy credits</h2>

      {signedIn ? (
        <div className="mt-3 grid max-w-sm gap-2">
          <Label htmlFor="mobile">Mobile number</Label>
          <Input
            autoComplete="tel"
            id="mobile"
            inputMode="tel"
            onChange={(event) => setMobile(event.target.value)}
            placeholder="08123456789"
            required
            type="tel"
            value={mobile}
          />
          <p className="text-muted-foreground text-xs">
            Mayar needs this on the invoice. It is asked once and remembered.
          </p>
        </div>
      ) : null}

      <ul className="mt-6 grid gap-4 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <li className="flex flex-col rounded-3xl border p-6" key={pack.id}>
            <p className="text-muted-foreground text-sm">{pack.name}</p>
            <p className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em] tabular-nums">
              {pack.credits}
            </p>
            <p className="text-muted-foreground text-sm">credits</p>
            <p className="mt-4 font-medium">{formatIdr(pack.amount)}</p>
            <p className="text-muted-foreground text-xs">
              {formatIdr(idrPerCredit(pack))} each
            </p>
            {signedIn ? (
              <Button
                className="mt-6 min-h-11 rounded-full"
                disabled={pendingPack !== null || mobile.trim().length < 8}
                onClick={() => buy(pack.id)}
                type="button"
                variant={pack.id === "standard" ? "default" : "outline"}
              >
                {pendingPack === pack.id ? (
                  <Spinner className="size-4" />
                ) : null}
                Buy
              </Button>
            ) : (
              <Link
                className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-border text-sm"
                to="/auth"
              >
                Sign in
              </Link>
            )}
          </li>
        ))}
      </ul>

      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

type PurchaseRowProps = {
  purchase: {
    amount: number;
    createdAt: number;
    credits: number;
    id: string;
    paymentUrl: string | null;
    reference: string;
    status: string;
  };
};

function PurchaseRow({ purchase }: PurchaseRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function recheck() {
    setBusy(true);

    try {
      await refreshPurchase({ data: purchase.id });
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
      <span>
        <span className="font-medium tabular-nums">{purchase.credits}</span>{" "}
        credits
        <span className="text-muted-foreground">
          {" "}
          · {formatIdr(purchase.amount)} · {purchase.reference}
        </span>
      </span>
      <span className="flex items-center gap-3">
        <span className="text-muted-foreground text-xs">
          {formatMoment(purchase.createdAt)}
        </span>
        <span className="capitalize">{purchase.status}</span>
        {purchase.status === "pending" ? (
          <>
            {purchase.paymentUrl ? (
              <a
                className="underline underline-offset-4"
                href={purchase.paymentUrl}
              >
                Pay
              </a>
            ) : null}
            <Button
              className="min-h-9 rounded-full"
              disabled={busy}
              onClick={recheck}
              size="sm"
              type="button"
              variant="outline"
            >
              {busy ? <Spinner className="size-3.5" /> : null}
              Re-check
            </Button>
          </>
        ) : null}
      </span>
    </li>
  );
}
