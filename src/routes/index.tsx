import { createFileRoute, getRouteApi } from "@tanstack/react-router";

import { ImageGenerator } from "@/components/image-generator";
import { listGenerations } from "@/lib/generation.functions";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/")({
  component: CreatePage,
  head: () => ({
    meta: [
      { title: "Imagenation — describe it, and see it" },
      {
        content:
          "Write a description and get an image back. Two credits for a 1K image, no subscription.",
        name: "description",
      },
    ],
  }),
  // A signed-out visitor still gets the whole app, just with nothing of their
  // own in it. There is no landing page to send them to.
  loader: () => listGenerations().catch(() => []),
});

function CreatePage() {
  const recent = Route.useLoaderData();
  const { balance, signedIn } = rootApi.useLoaderData();

  return (
    <main>
      <ImageGenerator balance={balance} recent={recent} signedIn={signedIn} />
    </main>
  );
}
