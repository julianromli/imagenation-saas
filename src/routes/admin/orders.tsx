import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="p-0" colSpan={4}>
                    <Link
                      className="flex flex-wrap items-center justify-between gap-4 p-2 py-4 transition-colors hover:bg-muted/50"
                      params={{ id: order.id }}
                      to="/admin/orders/$id"
                    >
                      <div className="min-w-48">
                        <p className="font-medium">{order.orderNumber}</p>
                        <p className="mt-1 text-muted-foreground text-sm">
                          {order.guestName} · {order.guestEmail}
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {formatOrderStatus(order.status)}
                      </Badge>
                      <span className="text-sm">{formatIdr(order.total)}</span>
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="mt-8 min-h-48">
          <EmptyHeader>
            <EmptyTitle>No orders yet</EmptyTitle>
            <EmptyDescription>
              Orders will appear here after customers check out.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      <Card className="mt-12 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Webhook audit</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-4">
          {events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.slice(0, 10).map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      {event.eventType}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">
                      {event.transactionId ?? "Transaction mapping pending"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {formatOrderStatus(event.status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm">
              Mayar webhook events will appear here after setup.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
