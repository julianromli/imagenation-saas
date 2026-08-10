import { env } from "cloudflare:workers";
import { createFileRoute } from "@tanstack/react-router";

import { getFreshSession } from "@/lib/auth";
import { createId } from "@/lib/ids";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  REFERENCE_IMAGE_PREFIX,
} from "@/lib/uploads";

/** Reads a body, giving up as soon as it passes `maxBytes`. */
async function readBounded(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number
) {
  if (!body) {
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    let done = false;

    while (!done) {
      // biome-ignore lint/performance/noAwaitInLoops: Reading a stream is sequential by definition.
      const { done: finished, value } = await reader.read();

      done = finished;

      if (!value) {
        continue;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();

        return null;
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

export const Route = createFileRoute("/api/uploads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await getFreshSession(request.headers);

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Uploading costs storage and nothing else, but it is still a write a
        // signed-in stranger can repeat. The generate limiter covers it.
        await consumeRateLimit("GENERATE_LIMITER", session.user.id);

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

        // A declared length can lie, and it can also be absent. Read in chunks
        // and stop as soon as the cap is passed, rather than buffering whatever
        // arrives and checking afterwards.
        const body = await readBounded(request.body, MAX_IMAGE_BYTES);

        if (!body) {
          return Response.json(
            { error: "Choose an image of 4MB or less" },
            { status: 413 }
          );
        }

        if (body.byteLength === 0) {
          return Response.json(
            { error: "That request carried no image" },
            { status: 400 }
          );
        }

        // The owner is in the key, so the read path can decide access from the
        // key alone without a database lookup.
        const objectKey = `${REFERENCE_IMAGE_PREFIX}${session.user.id}/${createId()}.${extension}`;

        await env.BUCKET.put(objectKey, body, {
          httpMetadata: { contentType },
        });

        return Response.json({ objectKey });
      },
    },
  },
});
