import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle, RefreshCw } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <Alert className="mt-4" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="rounded-3xl border bg-transparent shadow-none ring-0">
          <CardHeader className="p-6 pb-0">
            <CardTitle>Customer and shipping</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <address className="text-muted-foreground text-sm not-italic leading-6">
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
          </CardContent>
        </Card>
        <Card className="rounded-3xl border bg-transparent shadow-none ring-0">
          <CardHeader className="p-6 pb-0">
            <CardTitle>Payment</CardTitle>
          </CardHeader>
          <CardContent className="p-6 pt-4">
            <dl className="grid gap-3 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <Badge variant="secondary">
                    {formatOrderStatus(order.paymentStatus)}
                  </Badge>
                </dd>
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
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead className="text-right">Line total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    {item.productName} × {item.quantity}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatIdr(item.lineTotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">
                  {formatIdr(order.total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Payment attempts</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          {attempts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attempts.map((attempt) => (
                  <TableRow key={attempt.id}>
                    <TableCell className="text-muted-foreground">
                      {attempt.invoiceId}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatOrderStatus(attempt.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              No payment attempt recorded.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Status history</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Badge variant="secondary">
                      {formatOrderStatus(entry.toStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {entry.note ?? "Status updated"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
