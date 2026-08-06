import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getAdminOrder,
  markOrderRefunded,
  resyncOrderPayment,
  updateOrderStatus,
} from "@/lib/admin.functions";
import { formatIdr, formatOrderStatus } from "@/lib/format";

export const Route = createFileRoute("/admin/orders/$id")({
  component: AdminOrderDetail,
  loader: ({ params }) => getAdminOrder({ data: { id: params.id } }),
});

type NextOrderStatus = "delivered" | "processing" | "shipped";

function nextStatusesFor(status: string): readonly NextOrderStatus[] {
  switch (status) {
    case "paid":
      return ["processing"];
    case "processing":
      return ["shipped"];
    case "shipped":
      return ["delivered"];
    default:
      return [];
  }
}

function AdminOrderDetail() {
  const { attempts, history, items, order } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmingRefund, setConfirmingRefund] = useState(false);

  async function update(
    status: "cancelled" | "delivered" | "processing" | "shipped"
  ) {
    setBusy(true);
    setError("");

    try {
      await updateOrderStatus({ data: { orderId: order.id, status } });
      await router.invalidate();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to update order"
      );
    } finally {
      setBusy(false);
    }
  }

  async function resync() {
    setBusy(true);
    setError("");

    try {
      await resyncOrderPayment({ data: { id: order.id } });
      await router.invalidate();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to resync payment"
      );
    } finally {
      setBusy(false);
    }
  }

  async function markRefunded() {
    setBusy(true);
    setError("");

    try {
      await markOrderRefunded({ data: { id: order.id } });
      setConfirmingRefund(false);
      await router.invalidate();
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "Unable to mark refund"
      );
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = nextStatusesFor(order.status);

  return (
    <section>
      <Link
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        to="/admin/orders"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to orders
      </Link>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="text-muted-foreground text-sm">
            Order {order.orderNumber}
          </p>
          <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
            {formatOrderStatus(order.status)}
          </h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {nextStatuses.map((status) => (
            <Button disabled={busy} key={status} onClick={() => update(status)}>
              Mark {formatOrderStatus(status)}
            </Button>
          ))}
          {order.status === "pending_payment" ? (
            <Button disabled={busy} onClick={resync} variant="outline">
              <RefreshCw aria-hidden="true" />
              Resync payment
            </Button>
          ) : null}
          {order.paymentStatus === "paid" && !confirmingRefund ? (
            <Button
              disabled={busy}
              onClick={() => setConfirmingRefund(true)}
              variant="destructive"
            >
              Mark refunded
            </Button>
          ) : null}
          {order.paymentStatus === "paid" && confirmingRefund ? (
            <div className="flex items-center gap-2 rounded-xl border p-1">
              <span className="px-2 text-xs text-muted-foreground">
                Refunded in Mayar?
              </span>
              <Button
                disabled={busy}
                onClick={markRefunded}
                size="sm"
                variant="destructive"
              >
                Confirm
              </Button>
              <Button
                disabled={busy}
                onClick={() => setConfirmingRefund(false)}
                size="sm"
                variant="ghost"
              >
                Cancel
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {busy ? (
        <p className="mt-4 inline-flex items-center gap-2 text-muted-foreground text-sm">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          Updating order
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <section className="rounded-3xl border p-6">
          <h3 className="font-medium">Customer and shipping</h3>
          <address className="mt-4 text-muted-foreground text-sm not-italic leading-6">
            {order.guestName}
            <br />
            {order.guestEmail}
            <br />
            {order.guestPhone}
            <br />
            <br />
            {order.addressLine}
            <br />
            {order.city}, {order.province} {order.postalCode}
          </address>
        </section>
        <section className="rounded-3xl border p-6">
          <h3 className="font-medium">Payment</h3>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>{formatOrderStatus(order.paymentStatus)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Amount</dt>
              <dd>{formatIdr(order.total)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Transaction</dt>
              <dd className="max-w-[14rem] truncate">
                {order.mayarTransactionId ?? "Pending"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="mt-8 rounded-3xl border p-6">
        <h3 className="font-medium">Items</h3>
        <div className="mt-4 divide-y">
          {items.map((item) => (
            <div
              className="flex justify-between gap-4 py-3 text-sm"
              key={item.id}
            >
              <span>
                {item.productName} × {item.quantity}
              </span>
              <span>{formatIdr(item.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t pt-4 font-medium text-sm">
          <span>Total</span>
          <span>{formatIdr(order.total)}</span>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border p-6">
        <h3 className="font-medium">Payment attempts</h3>
        {attempts.length > 0 ? (
          <div className="mt-4 divide-y text-sm">
            {attempts.map((attempt) => (
              <div
                className="flex flex-wrap justify-between gap-3 py-3"
                key={attempt.id}
              >
                <span className="text-muted-foreground">
                  {attempt.invoiceId}
                </span>
                <span>{formatOrderStatus(attempt.status)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-muted-foreground text-sm">
            No payment attempt recorded.
          </p>
        )}
      </section>

      <section className="mt-8 rounded-3xl border p-6">
        <h3 className="font-medium">Status history</h3>
        <div className="mt-4 divide-y text-sm">
          {history.map((entry) => (
            <div className="py-3" key={entry.id}>
              <p>{formatOrderStatus(entry.toStatus)}</p>
              <p className="mt-1 text-muted-foreground">
                {entry.note ?? "Status updated"}
              </p>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
