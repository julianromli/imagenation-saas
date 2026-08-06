import { createFileRoute } from "@tanstack/react-router";

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

          const result = await createOrderForCheckout(parsed.data);

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
