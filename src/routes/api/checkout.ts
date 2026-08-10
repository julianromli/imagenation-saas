import { createFileRoute } from "@tanstack/react-router";

import { InvalidRequestError, RateLimitError } from "@/lib/errors";
import { createOrderForCheckout } from "@/lib/order.functions";
import { checkoutSchema } from "@/lib/validation";

export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const parsed = checkoutSchema.safeParse(await request.json());

          if (!parsed.success) {
            return Response.json(
              {
                error: "Checkout data is invalid",
                issues: parsed.error.issues,
              },
              { status: 422 }
            );
          }

          // The key check and the rate limit belong to the shared checkout
          // path, not to this handler. Required by ADR-0002: the key is what
          // makes a retry safe.
          const result = await createOrderForCheckout(
            parsed.data,
            request.headers.get("Idempotency-Key"),
            new URL(request.url).origin
          );

          return Response.json(result);
        } catch (error) {
          if (
            error instanceof InvalidRequestError ||
            error instanceof RateLimitError
          ) {
            return Response.json(
              { error: error.message },
              { status: error.status }
            );
          }

          console.error("Checkout creation failed", error);

          return Response.json(
            { error: "Unable to create the order" },
            { status: 500 }
          );
        }
      },
    },
  },
});
