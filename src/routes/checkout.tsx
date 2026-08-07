import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCartProducts } from "@/hooks/use-cart-products";
import { formatIdr } from "@/lib/format";
import { createOrder } from "@/lib/order.functions";
import { saveLastOrderHint } from "@/lib/order-access";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const { clear, lines } = useCart();
  const {
    error: cartError,
    items,
    loading,
    retry,
    subtotal,
  } = useCartProducts();
  const [submitting, setSubmitting] = useState(false);
  // One key for this checkout attempt. A failed submit reuses it, so a retry is
  // recognised as the same checkout rather than a new one. See ADR-0003.
  const idempotencyKey = useRef(crypto.randomUUID());
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const result = await createOrder({
        data: {
          addressLine: String(form.get("addressLine") ?? ""),
          city: String(form.get("city") ?? ""),
          email: String(form.get("email") ?? ""),
          guestName: String(form.get("guestName") ?? ""),
          lines: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
          })),
          phone: String(form.get("phone") ?? ""),
          postalCode: String(form.get("postalCode") ?? ""),
          province: String(form.get("province") ?? ""),
        },
        headers: { "Idempotency-Key": idempotencyKey.current },
      });

      const orderStatusPath = `/orders/${result.accessToken}`;

      saveLastOrderHint({
        createdAt: new Date().toISOString(),
        orderNumber: result.orderNumber,
        orderStatusPath,
      });
      idempotencyKey.current = crypto.randomUUID();
      clear();
      window.location.assign(orderStatusPath);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create your order. Check the form and try again."
      );
      setSubmitting(false);
    }
  }

  if (cartError) {
    return (
      <main className="mx-auto max-w-3xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          Could not load your bag.
        </h1>
        <p className="mt-4 text-muted-foreground text-sm">{cartError}</p>
        <p className="mt-2 text-muted-foreground text-sm">
          Your items are still saved on this device.
        </p>
        <Button className="mt-8 rounded-full" onClick={retry} type="button">
          Try again
        </Button>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-20 pb-32 text-center sm:px-8">
        <p className="text-muted-foreground text-sm">Loading your bag</p>
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-5xl tracking-[-0.06em]">
          Your bag is empty.
        </h1>
        <Link className={buttonVariants({ className: "mt-8" })} to="/products">
          Browse the collection
        </Link>
        <p className="mt-6 text-muted-foreground text-sm">
          Lost an order link?{" "}
          <Link
            className="underline-offset-4 hover:underline"
            to="/orders/find"
          >
            Find your order
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-5 pt-10 pb-20 sm:px-8">
      <Link
        className="inline-flex items-center gap-2 text-muted-foreground text-sm hover:text-foreground"
        to="/cart"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to bag
      </Link>
      <div className="mt-8 grid gap-12 lg:grid-cols-[1fr_0.72fr]">
        <div>
          <p className="text-muted-foreground text-sm">Checkout</p>
          <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
            Where should we send it?
          </h1>
          <form className="mt-10 space-y-8" onSubmit={submit}>
            <section aria-labelledby="contact-heading">
              <h2 className="font-medium text-sm" id="contact-heading">
                Contact
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field
                  autoComplete="name"
                  label="Full name"
                  name="guestName"
                  required
                />
                <Field
                  autoComplete="email"
                  label="Email address"
                  name="email"
                  required
                  type="email"
                />
                <Field
                  autoComplete="tel"
                  label="Phone number"
                  name="phone"
                  required
                  type="tel"
                />
              </div>
            </section>

            <section aria-labelledby="shipping-heading">
              <h2 className="font-medium text-sm" id="shipping-heading">
                Shipping address
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label
                  className="space-y-2 sm:col-span-2"
                  htmlFor="addressLine"
                >
                  <span className="text-sm">Address</span>
                  <Input
                    autoComplete="street-address"
                    id="addressLine"
                    name="addressLine"
                    placeholder="Street and house number"
                    required
                  />
                </label>
                <Field
                  autoComplete="address-level2"
                  label="City"
                  name="city"
                  required
                />
                <Field
                  autoComplete="address-level1"
                  label="Province"
                  name="province"
                  required
                />
                <Field
                  autoComplete="postal-code"
                  label="Postal code"
                  maxLength={5}
                  name="postalCode"
                  pattern="\d{5}"
                  required
                />
              </div>
            </section>

            {error ? (
              <p
                className="rounded-2xl bg-destructive/10 p-4 text-destructive text-sm"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <Button
              className="h-12 w-full rounded-full sm:w-auto"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Creating order
                </>
              ) : (
                "Continue to payment"
              )}
            </Button>
          </form>
        </div>

        <aside className="h-fit rounded-3xl bg-muted/60 p-6 lg:sticky lg:top-6">
          <h2 className="font-medium">Order summary</h2>
          <div className="mt-5 space-y-4">
            {items.map(({ line, product }) => (
              <div
                className="flex justify-between gap-4 text-sm"
                key={product.id}
              >
                <span className="text-muted-foreground">
                  {product.name} × {line.quantity}
                </span>
                <span className="shrink-0">
                  {formatIdr(product.price * line.quantity)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-6 border-t pt-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatIdr(subtotal)}</span>
            </div>
            <div className="mt-3 flex justify-between text-sm">
              <span className="text-muted-foreground">Shipping</span>
              <span>Calculated at checkout</span>
            </div>
            <p className="mt-5 text-muted-foreground text-xs leading-5">
              Your stock is reserved for 30 minutes while payment is completed.
              Save the order status page after checkout to track this order.
            </p>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Field({
  autoComplete,
  label,
  maxLength,
  name,
  pattern,
  required = false,
  type = "text",
}: {
  autoComplete?: string;
  label: string;
  maxLength?: number;
  name: string;
  pattern?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-2" htmlFor={name}>
      <span className="text-sm">{label}</span>
      <Input
        autoComplete={autoComplete}
        id={name}
        maxLength={maxLength}
        name={name}
        pattern={pattern}
        required={required}
        type={type}
      />
    </label>
  );
}
