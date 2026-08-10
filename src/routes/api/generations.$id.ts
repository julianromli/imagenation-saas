import { createFileRoute } from "@tanstack/react-router";
import { and, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { generations } from "@/db/schema";
import { getFreshSession } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { toGenerationView } from "@/lib/generation.functions";

/**
 * Lets a reloaded tab rejoin a generation it started.
 *
 * The work runs under `waitUntil` and finishes whether or not anybody is
 * listening, so this only has to report where it got to. See ADR-0017.
 */
export const Route = createFileRoute("/api/generations/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const session = await getFreshSession(request.headers);

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const row = await getDb().query.generations.findFirst({
          where: and(
            eq(generations.id, params.id),
            eq(generations.userId, session.user.id)
          ),
        });

        if (!row) {
          return Response.json({ error: "Not found" }, { status: 404 });
        }

        return Response.json({
          balance: await getBalance(session.user.id),
          generation: toGenerationView(row),
        });
      },
    },
  },
});
