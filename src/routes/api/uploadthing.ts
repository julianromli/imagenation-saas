import { createFileRoute } from "@tanstack/react-router";
import { createRouteHandler } from "uploadthing/server";
import { getRuntimeEnv } from "@/lib/runtime-env";
import { uploadRouter } from "@/lib/uploadthing";

function handlers() {
  return createRouteHandler({
    config: {
      fetch: (url, init) => {
        if (init && "cache" in init) {
          const { cache: _cache, ...nextInit } = init;

          return fetch(url, nextInit);
        }

        return fetch(url, init);
      },
      handleDaemonPromise: (promise) => {
        promise.catch(() => undefined);
      },
      isDev:
        typeof process !== "undefined" && process.env.NODE_ENV !== "production",
      token: getRuntimeEnv().UPLOADTHING_TOKEN ?? "",
    },
    router: uploadRouter,
  });
}

export const Route = createFileRoute("/api/uploadthing")({
  server: {
    handlers: {
      GET: ({ request }) => handlers()(request),
      POST: ({ request }) => handlers()(request),
    },
  },
});
