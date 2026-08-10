import { waitUntil } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { getFreshSession } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { isHttpError } from "@/lib/errors";
import { executeGeneration, startGeneration } from "@/lib/generation";
import { toGenerationView } from "@/lib/generation.functions";
import { consumeRateLimit } from "@/lib/rate-limit";
import { generateSchema } from "@/lib/validation";

export const Route = createFileRoute("/api/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getFreshSession(request.headers);

        if (!session) {
          return Response.json(
            { error: "Sign in to generate" },
            { status: 401 }
          );
        }

        const userId = session.user.id;

        try {
          await consumeRateLimit("GENERATE_LIMITER", userId);

          const parsed = generateSchema.safeParse(await request.json());

          if (!parsed.success) {
            return Response.json(
              {
                error: "That request is not valid",
                issues: parsed.error.issues,
              },
              { status: 422 }
            );
          }

          const { generation, replayed } = await startGeneration({
            idempotencyKey: request.headers.get("Idempotency-Key"),
            request: parsed.data,
            userId,
          });

          // A replay of a job that already settled is answered from the row.
          // A replay of one still running rejoins it below.
          if (replayed && generation.status !== "pending") {
            return Response.json({
              balance: await getBalance(userId),
              generation: toGenerationView(generation),
            });
          }

          const work = executeGeneration(generation.id);

          // The tab may close, the network may drop, the user may navigate
          // away. The credits are already spent, so the work has to finish
          // regardless of who is still listening. See ADR-0017.
          waitUntil(work);

          const settled = await work;

          return Response.json({
            balance: await getBalance(userId),
            generation: toGenerationView(settled),
          });
        } catch (error) {
          if (isHttpError(error)) {
            return Response.json(
              { error: error.message },
              { status: error.status }
            );
          }

          console.error("Generation request failed", error);

          return Response.json(
            { error: "Unable to start the image" },
            { status: 500 }
          );
        }
      },
    },
  },
});
