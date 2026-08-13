import {
  createFileRoute,
  getRouteApi,
  Link,
  useRouter,
} from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { CreditCheckoutDialog } from "@/components/credit-checkout-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { listCreditHistory } from "@/lib/credits.functions";
import { formatDelta, formatIdr, formatMoment } from "@/lib/format";
import type { CreditPack } from "@/lib/pricing";
import {
  CREDIT_PACKS,
  findPack,
  idrPerCredit,
  RESOLUTION_TIERS,
} from "@/lib/pricing";
import type { PurchaseView } from "@/lib/purchase";
import {
  getSavedMobile,
  listPurchases,
  refreshPurchase,
} from "@/lib/purchase.functions";
import { cn } from "@/lib/utils";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/credits")({
  component: CreditsPage,
  head: () => ({
    meta: [{ title: "Credits — Imagenation" }],
  }),
  loader: async () => {
    const [entries, purchases, savedMobile] = await Promise.all([
      listCreditHistory().catch(() => null),
      listPurchases().catch(() => []),
      getSavedMobile().catch(() => null),
    ]);

    return { entries, purchases, savedMobile };
  },
});

type Checkout = {
  pack: CreditPack;
  /** Set when reopening a payment that is already in flight. */
  resume: PurchaseView | null;
};

function CreditsPage() {
  const { entries, purchases, savedMobile } = Route.useLoaderData();
  const { balance, signedIn } = rootApi.useLoaderData();
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);

  const closeCheckout = useCallback((open: boolean) => {
    if (!open) {
      setCheckout(null);
    }
  }, []);

  const refresh = useCallback(() => {
    router.invalidate();
  }, [router]);

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

      <PackList onBuy={setCheckout} signedIn={signedIn} />

      {purchases.length > 0 ? (
        <section className="mt-14">
          <h2 className="text-muted-foreground text-sm">Purchases</h2>
          <ul className="mt-3 divide-y rounded-3xl border">
            {purchases.map((purchase) => (
              <PurchaseRow
                key={purchase.id}
                onResume={setCheckout}
                purchase={purchase}
              />
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

      {checkout ? (
        <CreditCheckoutDialog
          // A fresh dialog per payment, so reopening one never shows the last.
          key={checkout.resume?.id ?? checkout.pack.id}
          onOpenChange={closeCheckout}
          onSettled={refresh}
          open
          pack={checkout.pack}
          resume={checkout.resume}
          savedMobile={savedMobile}
        />
      ) : null}
    </main>
  );
}

type PackListProps = {
  onBuy: (checkout: Checkout) => void;
  signedIn: boolean;
};

function PackList({ onBuy, signedIn }: PackListProps) {
  return (
    <section className="mt-12">
      <h2 className="text-muted-foreground text-sm">Buy credits</h2>
      <p className="mt-2 text-muted-foreground text-sm">
        Pay with QRIS, a bank transfer, or an e-wallet, without leaving this
        page.
      </p>

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
                onClick={() => onBuy({ pack, resume: null })}
                type="button"
                variant={pack.id === "standard" ? "default" : "outline"}
              >
                Buy
              </Button>
            ) : (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline" }),
                  "mt-6 min-h-11 rounded-full"
                )}
                to="/auth"
              >
                Sign in
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type PurchaseRowProps = {
  onResume: (checkout: Checkout) => void;
  purchase: PurchaseView;
};

function PurchaseRow({ onResume, purchase }: PurchaseRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const pack = findPack(purchase.packId);

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
            {pack ? (
              <Button
                className="min-h-9 rounded-full"
                onClick={() => onResume({ pack, resume: purchase })}
                size="sm"
                type="button"
              >
                Resume payment
              </Button>
            ) : null}
            {purchase.paymentUrl ? (
              <a
                className="underline underline-offset-4"
                href={purchase.paymentUrl}
                rel="noreferrer"
                target="_blank"
              >
                Pay on Mayar
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
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Re-check
            </Button>
          </>
        ) : null}
      </span>
    </li>
  );
}
