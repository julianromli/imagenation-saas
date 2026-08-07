import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { PRODUCT_IMAGE_PREFIX } from "@/lib/uploads";

// Object keys carry a UUID and are never rewritten, so a stored copy can never
// go stale.
const IMMUTABLE_FOR_A_YEAR = "public, max-age=31536000, immutable";

export const Route = createFileRoute("/images/$")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const objectKey = params._splat ?? "";

        // Only product images are served here. A bucket may hold other things.
        if (!objectKey.startsWith(PRODUCT_IMAGE_PREFIX)) {
          return new Response("Not found", { status: 404 });
        }

        const object = await env.BUCKET.get(objectKey);

        if (!object) {
          return new Response("Not found", { status: 404 });
        }

        const headers = new Headers();

        object.writeHttpMetadata(headers);
        headers.set("cache-control", IMMUTABLE_FOR_A_YEAR);
        headers.set("etag", object.httpEtag);

        if (request.headers.get("if-none-match") === object.httpEtag) {
          return new Response(null, { headers, status: 304 });
        }

        return new Response(object.body, { headers });
      },
    },
  },
});
