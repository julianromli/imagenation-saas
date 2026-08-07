import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { getFreshSession } from "@/lib/auth";
import { createId } from "@/lib/ids";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  PRODUCT_IMAGE_PREFIX,
} from "@/lib/uploads";

export const Route = createFileRoute("/api/uploads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getFreshSession(request.headers);

        if (session?.user.role !== "admin") {
          return Response.json({ error: "Unauthorized" }, { status: 403 });
        }

        const contentType = request.headers.get("content-type") ?? "";
        const extension = ALLOWED_IMAGE_TYPES.get(contentType);

        if (!extension) {
          return Response.json(
            { error: "Choose a PNG, JPEG, WebP, or AVIF image" },
            { status: 415 }
          );
        }

        const declaredSize = Number(
          request.headers.get("content-length") ?? "0"
        );

        if (declaredSize > MAX_IMAGE_BYTES) {
          return Response.json(
            { error: "Choose an image of 4MB or less" },
            { status: 413 }
          );
        }

        // Read the body rather than stream it. The size cap above keeps this
        // bounded, and a declared length can lie.
        const body = await request.arrayBuffer();

        if (body.byteLength > MAX_IMAGE_BYTES) {
          return Response.json(
            { error: "Choose an image of 4MB or less" },
            { status: 413 }
          );
        }

        const objectKey = `${PRODUCT_IMAGE_PREFIX}${createId()}.${extension}`;

        await env.BUCKET.put(objectKey, body, {
          httpMetadata: { contentType },
        });

        return Response.json({ objectKey });
      },
    },
  },
});
