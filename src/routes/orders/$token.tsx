import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check, Circle, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { formatIdr, formatOrderStatus } from "@/lib/format";
import { claimOrder, getOrderByAccessToken } from "@/lib/order.functions";

const statuses = ["paid", "processing", "shipped", "delivered"] as const;

export const Route = createFileRoute("/orders/$token")({
  component: OrderStatusPage,
  loader: async ({ params }) => {
    const [orderData, session] = await Promise.all([
      getOrderByAccessToken({ data: { token: params.token } }),
      getSession(),
    ]);

    return { ...orderData, session };
  },
});

function OrderStatusPage() {
  const { items, order, session } = Route.useLoaderData();
  const params = Route.useParams();
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState("");
  const currentIndex = statuses.indexOf(
    order.status as (typeof statuses)[number]
  );

  async function claim() {
    setClaiming(true);
    setClaimError("");

    try {
      await claimOrder({ data: { token: params.token } });
      await router.invalidate();
    } catch (error) {
      setClaimError(
        error instanceof Error ? error.message : "Unable to claim this order"
      );
    } finally {
      setClaiming(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-5 pt-14 pb-20 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-muted-foreground text-sm">
            Order {order.orderNumber}
          </p>
          <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
            {order.status === "pending_payment"
              ? "Your order is reserved."
              : "We have your order."}
          </h1>
        </div>
        <Button onClick={() => window.location.reload()} variant="outline">
          <RefreshCw aria-hidden="true" />
          Refresh status
        </Button>
      </div>

      {order.status === "pending_payment" && order.paymentUrl ? (
        <section className="mt-10 rounded-3xl bg-foreground p-6 text-background sm:p-8">
          <p className="text-background/70 text-sm">Payment required</p>
          <h2 className="mt-2 font-medium text-2xl">
            Complete payment to confirm your order.
          </h2>
          <p className="mt-3 max-w-lg text-background/70 text-sm leading-6">
            Your items are reserved for 30 minutes. The payment page opens in a
            new tab, and this page will show the confirmed status after Mayar
            sends the payment event.
          </p>
          <a
            className={buttonVariants({
              className:
                "mt-6 bg-background text-foreground hover:bg-background/85",
              variant: "secondary",
            })}
            href={order.paymentUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open payment page
            <ExternalLink aria-hidden="true" />
          </a>
        </section>
      ) : null}

      {session && !order.userId ? (
        <section className="mt-10 rounded-3xl border p-6">
          <h2 className="font-medium">Keep this order in your account</h2>
          <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-6">
            Claim this guest order with your signed-in email so it appears in
            your order history.
          </p>
          {claimError ? (
            <p className="mt-3 text-destructive text-sm" role="alert">
              {claimError}
            </p>
          ) : null}
          <Button
            className="mt-5 rounded-full"
            disabled={claiming}
            onClick={claim}
          >
            {claiming ? "Claiming order" : "Claim order"}
          </Button>
        </section>
      ) : null}

      <section aria-labelledby="progress-heading" className="mt-12">
        <h2 className="font-medium text-sm" id="progress-heading">
          Order progress
        </h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-4">
          {statuses.map((status, index) => {
            const complete = currentIndex >= index && currentIndex >= 0;
            const current = order.status === status;

            return (
              <li
                className={`rounded-2xl border p-4 ${
                  current ? "border-foreground" : "border-border"
                }`}
                key={status}
              >
                {complete ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : (
                  <Circle
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                )}
                <p className="mt-5 font-medium text-sm">
                  {formatOrderStatus(status)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-12 grid gap-8 border-t pt-8 sm:grid-cols-2">
        <div>
          <h2 className="font-medium text-sm">Items</h2>
          <div className="mt-4 space-y-4">
            {items.map((item) => (
              <div className="flex justify-between gap-4 text-sm" key={item.id}>
                <span className="text-muted-foreground">
                  {item.productName} × {item.quantity}
                </span>
                <span>{formatIdr(item.lineTotal)}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h2 className="font-medium text-sm">Shipping to</h2>
          <address className="mt-4 text-muted-foreground text-sm not-italic leading-6">
            {order.guestName}
            <br />
            {order.addressLine}
            <br />
            {order.city}, {order.province} {order.postalCode}
            <br />
            {order.guestPhone}
          </address>
        </div>
      </section>

      <div className="mt-8 flex justify-between border-t pt-6 font-medium text-sm">
        <span>Total</span>
        <span>{formatIdr(order.total)}</span>
      </div>

      <Link
        className="mt-10 inline-flex text-sm underline-offset-4 hover:underline"
        to="/products"
      >
        Continue browsing
      </Link>
    </main>
  );
}
