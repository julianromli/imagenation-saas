import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check, Circle, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useEffectEvent, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { formatIdr, formatOrderStatus } from "@/lib/format";
import {
  claimOrder,
  getOrderByAccessToken,
  refreshOrderPayment,
} from "@/lib/order.functions";
import { saveLastOrderHint } from "@/lib/order-access";

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
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshNote, setRefreshNote] = useState("");
  const [copied, setCopied] = useState(false);
  const statusPath = `/orders/${params.token}`;
  const currentIndex = statuses.indexOf(
    order.status as (typeof statuses)[number]
  );

  const refreshPayment = useEffectEvent(async (silent: boolean) => {
    if (order.status !== "pending_payment") {
      return;
    }

    setRefreshing(true);
    setRefreshError("");
    setRefreshNote("");

    try {
      const result = await refreshOrderPayment({
        data: { token: params.token },
      });

      if (result.processed) {
        await router.invalidate();
        return;
      }

      if (!silent) {
        setRefreshNote(
          "Payment is not confirmed yet. Finish payment, then refresh again."
        );
      }
    } catch (error) {
      if (!silent) {
        setRefreshError(
          error instanceof Error
            ? error.message
            : "Unable to refresh payment status"
        );
      }
    } finally {
      setRefreshing(false);
    }
  });

  useEffect(() => {
    saveLastOrderHint({
      createdAt: new Date().toISOString(),
      orderNumber: order.orderNumber,
      orderStatusPath: statusPath,
    });
  }, [order.orderNumber, statusPath]);

  useEffect(() => {
    refreshPayment(true).catch(() => undefined);
  }, []);

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

  async function copyStatusLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}${statusPath}`
      );
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
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
        <Button
          disabled={refreshing}
          onClick={() => {
            refreshPayment(false).catch(() => undefined);
          }}
          variant="outline"
        >
          <RefreshCw
            aria-hidden="true"
            className={refreshing ? "animate-spin" : undefined}
          />
          {refreshing ? "Checking payment" : "Refresh status"}
        </Button>
      </div>

      <section className="mt-8 rounded-3xl border p-5 sm:p-6">
        <h2 className="font-medium text-sm">Save this order link</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
          Bookmark this page or copy the link. You can also recover it later
          with your email and order number.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button onClick={copyStatusLink} type="button" variant="outline">
            <Copy aria-hidden="true" />
            {copied ? "Copied" : "Copy status link"}
          </Button>
          <Link
            className={buttonVariants({ variant: "ghost" })}
            to="/orders/find"
          >
            Find an order
          </Link>
        </div>
      </section>

      {refreshError ? (
        <p className="mt-6 text-destructive text-sm" role="alert">
          {refreshError}
        </p>
      ) : null}
      {refreshNote ? (
        <p className="mt-6 text-muted-foreground text-sm">{refreshNote}</p>
      ) : null}

      {order.status === "pending_payment" && order.paymentUrl ? (
        <section className="mt-10 rounded-3xl bg-foreground p-6 text-background sm:p-8">
          <p className="text-background/70 text-sm">Payment required</p>
          <h2 className="mt-2 font-medium text-2xl">
            Complete payment to confirm your order.
          </h2>
          <p className="mt-3 max-w-lg text-background/70 text-sm leading-6">
            Your items are reserved for 30 minutes. After payment, Mayar returns
            you here. Use Refresh status if the page still shows pending.
          </p>
          <a
            className={buttonVariants({
              className:
                "mt-6 bg-background text-foreground hover:bg-background/85",
              variant: "secondary",
            })}
            href={order.paymentUrl}
          >
            Continue to payment
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
