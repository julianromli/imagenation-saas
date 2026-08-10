import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { getFreshSession } from "@/lib/auth";
import { GENERATION_IMAGE_PREFIX, REFERENCE_IMAGE_PREFIX } from "@/lib/uploads";

/**
 * Object keys carry a UUID and are never rewritten, so a stored copy can never
 * go stale. `private` keeps it out of every shared cache: these images belong
 * to one account, and the browser is the only cache allowed to hold them.
 * Sharing has its own public path. See ADR-0020.
 */
const PRIVATE_FOR_A_YEAR = "private, max-age=31536000, immutable";

/**
 * The owner's id is inside the key, so access is decided from the key and the
 * session alone. No database read, and no way to reach another account's image
 * by guessing a UUID.
 */
function isOwnedBy(objectKey: string, userId: string) {
  return (
    objectKey.startsWith(`${GENERATION_IMAGE_PREFIX}${userId}/`) ||
    objectKey.startsWith(`${REFERENCE_IMAGE_PREFIX}${userId}/`)
  );
}

export const Route = createFileRoute("/images/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const objectKey = params._splat ?? "";
        const session = await getFreshSession(request.headers);

        // A missing session and a wrong owner answer the same way. Whether an
        // image exists is not something a stranger should learn.
        if (!(session && isOwnedBy(objectKey, session.user.id))) {
          return new Response("Not found", { status: 404 });
        }

        const object = await env.BUCKET.get(objectKey);

        if (!object) {
          return new Response("Not found", { status: 404 });
        }

        const headers = new Headers();

        object.writeHttpMetadata(headers);
        headers.set("cache-control", PRIVATE_FOR_A_YEAR);
        headers.set("etag", object.httpEtag);

        if (request.headers.get("if-none-match") === object.httpEtag) {
          return new Response(null, { headers, status: 304 });
        }

        return new Response(object.body, { headers });
      },
    },
  },
});
