import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { getAdminOrders, getWebhookEvents } from "@/lib/admin.functions";
import { formatIdr, formatOrderStatus } from "@/lib/format";

export const Route = createFileRoute("/admin/orders")({
  component: AdminOrders,
  loader: () => Promise.all([getAdminOrders(), getWebhookEvents()]),
});

function AdminOrders() {
  const [orders, events] = Route.useLoaderData();

  return (
    <section>
      <p className="text-muted-foreground text-sm">Operations</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        Orders
      </h2>
      {orders.length > 0 ? (
        <div className="mt-8 divide-y border-y">
          {orders.map((order) => (
            <Link
              className="flex flex-wrap items-center justify-between gap-4 py-5 transition-colors hover:bg-muted/50"
              key={order.id}
              params={{ id: order.id }}
              to="/admin/orders/$id"
            >
              <div>
                <p className="font-medium">{order.orderNumber}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {order.guestName} · {order.guestEmail}
                </p>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="rounded-full bg-muted px-3 py-1">
                  {formatOrderStatus(order.status)}
                </span>
                <span>{formatIdr(order.total)}</span>
                <ChevronRight
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-10 text-muted-foreground text-sm">No orders yet.</p>
      )}
      <section className="mt-12">
        <h3 className="font-medium">Webhook audit</h3>
        {events.length > 0 ? (
          <div className="mt-4 divide-y border-y">
            {events.slice(0, 10).map((event) => (
              <div
                className="flex flex-wrap justify-between gap-3 py-4 text-sm"
                key={event.id}
              >
                <div>
                  <p className="font-medium">{event.eventType}</p>
                  <p className="mt-1 text-muted-foreground">
                    {event.transactionId ?? "Transaction mapping pending"}
                  </p>
                </div>
                <span className="rounded-full bg-muted px-3 py-1">
                  {formatOrderStatus(event.status)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Mayar webhook events will appear here after setup.
          </p>
        )}
      </section>
    </section>
  );
}
