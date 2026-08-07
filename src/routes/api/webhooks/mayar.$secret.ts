import { createFileRoute } from "@tanstack/react-router";

import { hashToken } from "@/lib/ids";
import { processMayarWebhook } from "@/lib/payment.functions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { readWebhookSecret } from "@/lib/setup-metadata";

// Mayar payloads are small. Anything larger is not a webhook.
const MAX_WEBHOOK_BYTES = 64 * 1024;

// Digests are compared rather than the secrets themselves. They are the same
// length whatever the input, so how long the comparison takes says nothing
// about how much of the secret a guess got right.
async function secretsMatch(left: string, right: string) {
  const [a, b] = await Promise.all([hashToken(left), hashToken(right)]);

  return a === b;
}

export const Route = createFileRoute("/api/webhooks/mayar/$secret")({
  server: {
    handlers: {
      POST: async ({ params, request }) => {
        const expected = await readWebhookSecret();

        if (!(expected && (await secretsMatch(params.secret, expected)))) {
          return new Response("Not found", { status: 404 });
        }

        await consumeRateLimit("WEBHOOK_LIMITER", "mayar-webhook");

        const declaredSize = Number(
          request.headers.get("content-length") ?? "0"
        );

        if (declaredSize > MAX_WEBHOOK_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        const body = await request.text();

        // `length` counts UTF-16 code units. A payload of multi-byte characters
        // is larger on the wire than that number suggests.
        if (new TextEncoder().encode(body).byteLength > MAX_WEBHOOK_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413 });
        }

        try {
          const result = await processMayarWebhook(JSON.parse(body));

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
