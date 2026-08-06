import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { findOrderAccess } from "@/lib/order.functions";
import { saveLastOrderHint } from "@/lib/order-access";

export const Route = createFileRoute("/orders/find")({
  component: FindOrderPage,
});

function FindOrderPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const result = await findOrderAccess({
        data: {
          email: String(form.get("email") ?? ""),
          orderNumber: String(form.get("orderNumber") ?? ""),
        },
      });

      saveLastOrderHint({
        createdAt: new Date().toISOString(),
        orderNumber: result.orderNumber,
        orderStatusPath: `/orders/${result.accessToken}`,
      });
      window.location.assign(`/orders/${result.accessToken}`);
    } catch (lookupError) {
      setError(
        lookupError instanceof Error
          ? lookupError.message
          : "Unable to find that order"
      );
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 pt-14 pb-20 sm:px-8">
      <p className="text-muted-foreground text-sm">Orders</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        Find your order
      </h1>
      <p className="mt-4 text-muted-foreground text-sm leading-6">
        Enter the email used at checkout and your order number. We open a fresh
        status link for matching orders.
      </p>

      <form className="mt-10 space-y-5" onSubmit={submit}>
        <label className="block space-y-2" htmlFor="email">
          <span className="text-sm">Email address</span>
          <Input
            autoComplete="email"
            id="email"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block space-y-2" htmlFor="orderNumber">
          <span className="text-sm">Order number</span>
          <Input
            autoComplete="off"
            id="orderNumber"
            name="orderNumber"
            placeholder="THN-20260806123456-ABC123"
            required
          />
        </label>

        {error ? (
          <p
            className="rounded-2xl bg-destructive/10 p-4 text-destructive text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}

        <Button
          className="h-12 w-full rounded-full"
          disabled={submitting}
          type="submit"
        >
          {submitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Looking up order
            </>
          ) : (
            "Open order status"
          )}
        </Button>
      </form>

      <p className="mt-8 text-muted-foreground text-sm">
        Have an account?{" "}
        <Link
          className={buttonVariants({ className: "px-0", variant: "link" })}
          to="/account/orders"
        >
          View signed-in order history
        </Link>
      </p>
    </main>
  );
}
