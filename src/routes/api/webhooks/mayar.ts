import { createFileRoute } from "@tanstack/react-router";

import { processMayarWebhook } from "@/lib/payment.functions";

export const Route = createFileRoute("/api/webhooks/mayar")({
  server: {
    handlers: {
      GET: () =>
        Response.json({
          endpoint: "mayar",
          status: "ready",
        }),
      POST: async ({ request }) => {
        try {
          const payload: unknown = await request.json();
          const result = await processMayarWebhook(payload);

          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("Mayar webhook processing failed", error);

          return Response.json(
            {
              error: "Webhook processing failed and will be retried",
              ok: false,
            },
            { status: 500 }
          );
        }
      },
    },
  },
});
