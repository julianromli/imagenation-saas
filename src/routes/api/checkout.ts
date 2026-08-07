import { createFileRoute } from "@tanstack/react-router";

import { createOrderForCheckout } from "@/lib/order.functions";
import { checkoutSchema } from "@/lib/validation";

export const Route = createFileRoute("/api/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          // Required by ADR-0002. The key is what makes a retry safe.
          const idempotencyKey = request.headers.get("Idempotency-Key");

          if (!idempotencyKey) {
            return Response.json(
              { error: "An Idempotency-Key header is required" },
              { status: 400 }
            );
          }

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

          const result = await createOrderForCheckout(
            parsed.data,
            idempotencyKey,
            new URL(request.url).origin
          );

          return Response.json(result);
        } catch (error) {
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
