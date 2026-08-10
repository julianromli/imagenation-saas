import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";
import { and, eq, isNotNull } from "drizzle-orm";

import { getDb } from "@/db";
import { generations } from "@/db/schema";

/**
 * A shared image is the one image in the bucket a stranger may read, so it is
 * also the only one worth caching at the edge. Private images are served from
 * `/images/…` with `private`. See ADR-0020.
 */
const PUBLIC_FOR_A_YEAR = "public, max-age=31536000, immutable";

export const Route = createFileRoute("/api/shared/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const row = await getDb().query.generations.findFirst({
          where: and(
            eq(generations.shareToken, params.token),
            isNotNull(generations.objectKey)
          ),
        });

        if (!row?.objectKey) {
          return new Response("Not found", { status: 404 });
        }

        const object = await env.BUCKET.get(row.objectKey);

        if (!object) {
          return new Response("Not found", { status: 404 });
        }

        const headers = new Headers();

        object.writeHttpMetadata(headers);
        headers.set("cache-control", PUBLIC_FOR_A_YEAR);
        headers.set("etag", object.httpEtag);

        if (request.headers.get("if-none-match") === object.httpEtag) {
          return new Response(null, { headers, status: 304 });
        }

        return new Response(object.body, { headers });
      },
    },
  },
});
