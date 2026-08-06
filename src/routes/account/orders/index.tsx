import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { ClaimableGuestOrders } from "@/components/claimable-guest-orders";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { formatIdr, formatOrderStatus } from "@/lib/format";
import { getClaimableGuestOrders, getMyOrders } from "@/lib/order.functions";

export const Route = createFileRoute("/account/orders/")({
  component: AccountOrdersPage,
  loader: async () => {
    const session = await getSession();

    if (!session) {
      return { claimableOrders: [], orders: null };
    }

    const [orders, claimableOrders] = await Promise.all([
      getMyOrders(),
      getClaimableGuestOrders(),
    ]);

    return { claimableOrders, orders };
  },
});

function AccountOrdersPage() {
  const { claimableOrders, orders } = Route.useLoaderData();

  if (!orders) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-5xl tracking-[-0.06em]">
          Sign in to see your orders.
        </h1>
        <Link className={buttonVariants({ className: "mt-8" })} to="/sign-in">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-5 pt-14 pb-20 sm:px-8">
      <p className="text-muted-foreground text-sm">Account</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        Order history
      </h1>

      {claimableOrders.length > 0 ? (
        <div className="mt-10">
          <ClaimableGuestOrders orders={claimableOrders} />
        </div>
      ) : null}

      {orders.length > 0 ? (
        <div className="mt-10 divide-y border-y">
          {orders.map((order) => (
            <Link
              className="group flex w-full flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              key={order.id}
              params={{ id: order.id }}
              to="/account/orders/$id"
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {order.createdAt.toLocaleDateString("en-ID")}
                </p>
              </div>
              <div className="flex items-center gap-5 text-sm">
                <span className="rounded-full bg-muted px-3 py-1">
                  {formatOrderStatus(order.status)}
                </span>
                <span>{formatIdr(order.total)}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-dashed p-10 text-center">
          <p className="font-medium">No orders yet</p>
          <p className="mt-2 text-muted-foreground text-sm">
            {claimableOrders.length > 0
              ? "Claim a guest order above to move it into this history."
              : "Your completed orders will appear here."}
          </p>
          {claimableOrders.length === 0 ? (
            <Link
              className={buttonVariants({ className: "mt-6" })}
              to="/products"
            >
              Browse the collection
            </Link>
          ) : null}
        </div>
      )}
    </main>
  );
}
