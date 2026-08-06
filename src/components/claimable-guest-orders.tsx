import { useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatIdr, formatOrderStatus } from "@/lib/format";
import {
  claimGuestOrderById,
  openClaimableGuestOrder,
} from "@/lib/order.functions";

export type ClaimableGuestOrder = {
  createdAt: Date;
  id: string;
  orderNumber: string;
  status: string;
  total: number;
};

export function ClaimableGuestOrders({
  orders,
}: {
  orders: ClaimableGuestOrder[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  if (orders.length === 0) {
    return null;
  }

  async function claim(orderId: string) {
    setBusyId(orderId);
    setError("");

    try {
      await claimGuestOrderById({ data: { orderId } });
      await router.invalidate();
    } catch (claimError) {
      setError(
        claimError instanceof Error
          ? claimError.message
          : "Unable to claim this order"
      );
    } finally {
      setBusyId(null);
    }
  }

  async function openStatus(orderId: string) {
    setBusyId(orderId);
    setError("");

    try {
      const result = await openClaimableGuestOrder({ data: { orderId } });
      window.location.assign(`/orders/${result.accessToken}`);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open this order"
      );
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-3xl border p-6">
      <h2 className="font-medium">Guest orders with your email</h2>
      <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-6">
        These checkouts used your email but are not in your account yet. Claim
        them here, or open the status page first.
      </p>

      {error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-6 divide-y border-y">
        {orders.map((order) => {
          const busy = busyId === order.id;

          return (
            <div
              className="flex flex-wrap items-center justify-between gap-4 py-5"
              key={order.id}
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {order.createdAt.toLocaleDateString("en-ID")} ·{" "}
                  {formatOrderStatus(order.status)} · {formatIdr(order.total)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy}
                  onClick={() => {
                    openStatus(order.id).catch(() => undefined);
                  }}
                  size="sm"
                  variant="outline"
                >
                  {busy ? "Working" : "Open status"}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => {
                    claim(order.id).catch(() => undefined);
                  }}
                  size="sm"
                >
                  {busy ? "Working" : "Claim"}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
