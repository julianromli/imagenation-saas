import { createFileRoute, Link } from "@tanstack/react-router";

import { buttonVariants } from "@/components/ui/button";
import type { SharedGenerationView } from "@/lib/generation.functions";
import { getSharedGeneration } from "@/lib/generation.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/s/$token")({
  component: SharedImagePage,
  /**
   * `loaderData` is annotated rather than inferred. `head` contributes to the
   * route's own type, so reading the inferred loader data here would make the
   * route type depend on itself and collapse to `never`.
   */
  head: ({ loaderData }: { loaderData?: SharedGenerationView | null }) => ({
    meta: [
      { title: "Shared image — Imagenation" },
      { content: "summary_large_image", name: "twitter:card" },
      ...(loaderData?.imageUrl
        ? [{ content: loaderData.imageUrl, property: "og:image" }]
        : []),
      {
        content: loaderData?.prompt ?? "An image made with Imagenation",
        name: "description",
      },
    ],
  }),
  loader: ({ params }) => getSharedGeneration({ data: params.token }),
});

function SharedImagePage() {
  const shared = Route.useLoaderData();

  if (!shared) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          This link is not live.
        </h1>
        <p className="mt-4 text-muted-foreground">
          The image was never shared, or its owner turned sharing off.
        </p>
        <Link
          className={cn(buttonVariants(), "mt-8 min-h-11 rounded-full px-5")}
          to="/"
        >
          Make your own
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-12 pb-24 sm:px-8">
      <img
        alt={shared.prompt ?? "A shared image"}
        className="w-full rounded-3xl bg-muted object-contain ring-1 ring-border"
        src={shared.imageUrl}
      />

      {shared.prompt ? (
        <blockquote className="mt-6 border-border border-l-2 pl-5 text-lg leading-8">
          {shared.prompt}
        </blockquote>
      ) : null}

      <p className="mt-6 text-muted-foreground text-sm">
        {shared.resolution} · {shared.aspectRatio}
      </p>

      <div className="mt-10 rounded-3xl border p-6">
        <p className="font-heading font-medium text-2xl tracking-[-0.04em]">
          Made with Imagenation.
        </p>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          Describe what you want and get an image back. New accounts start with
          free credits.
        </p>
        <Link
          className={cn(buttonVariants(), "mt-5 min-h-11 rounded-full px-5")}
          to="/"
        >
          Try it
        </Link>
      </div>
    </main>
  );
}
