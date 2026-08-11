import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { Check, Copy, Link2, Link2Off } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Switch } from "@/components/ui/switch";
import { formatMoment } from "@/lib/format";
import type { GenerationView } from "@/lib/generation.functions";
import {
  listGenerations,
  setGenerationShare,
} from "@/lib/generation.functions";
import { shareUrl } from "@/lib/images";
import { IMAGE_RETENTION_DAYS } from "@/lib/pricing";

export const Route = createFileRoute("/history")({
  component: HistoryPage,
  head: () => ({
    meta: [{ title: "History — Imagenation" }],
  }),
  loader: () => listGenerations().catch(() => null),
});

function HistoryPage() {
  const generations = Route.useLoaderData();

  if (!generations) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          Sign in to see your images.
        </h1>
        <Button
          className="mt-6 min-h-11 rounded-full px-5"
          render={<Link to="/auth" />}
        >
          Sign in
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 pt-12 pb-24 sm:px-8">
      <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
        History
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-6">
        Images are deleted after {IMAGE_RETENTION_DAYS} days. Sharing one keeps
        it, and its link, for good.
      </p>

      {generations.length === 0 ? (
        <Empty className="mt-12 border border-border border-dashed">
          <EmptyHeader>
            <EmptyTitle>Nothing here yet.</EmptyTitle>
            <EmptyDescription>
              Your images will appear here as you make them.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              className="min-h-11 rounded-full px-5"
              render={<Link to="/" />}
            >
              Make one
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <ul className="mt-10 grid gap-6 sm:grid-cols-2">
          {generations.map((generation) => (
            <HistoryCard generation={generation} key={generation.id} />
          ))}
        </ul>
      )}
    </main>
  );
}

function HistoryCard({ generation }: { generation: GenerationView }) {
  const router = useRouter();
  const [shareToken, setShareToken] = useState(generation.shareToken);
  const [promptVisible, setPromptVisible] = useState(
    generation.sharePromptVisible
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function updateShare(shared: boolean, visible: boolean) {
    setBusy(true);

    try {
      const result = await setGenerationShare({
        data: {
          generationId: generation.id,
          promptVisible: visible,
          shared,
        },
      });

      setShareToken(result.shareToken);
      setPromptVisible(result.sharePromptVisible);
      await router.invalidate();
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!shareToken) {
      return;
    }

    await navigator.clipboard.writeText(
      `${window.location.origin}${shareUrl(shareToken)}`
    );
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <li className="flex flex-col gap-3 rounded-3xl border p-4">
      {generation.imageUrl ? (
        <img
          alt={generation.prompt.slice(0, 120)}
          className="w-full rounded-2xl bg-muted object-cover ring-1 ring-border"
          src={generation.imageUrl}
        />
      ) : (
        <div className="flex min-h-40 items-center justify-center rounded-2xl bg-muted px-4 text-center text-muted-foreground text-sm">
          {generation.status === "failed"
            ? (generation.errorMessage ?? "This one failed")
            : "This image has been deleted"}
        </div>
      )}

      <p className="line-clamp-3 text-sm leading-6">{generation.prompt}</p>

      <p className="flex flex-wrap items-center gap-x-2 text-muted-foreground text-xs">
        <span>{formatMoment(generation.createdAt)}</span>
        <span aria-hidden="true">·</span>
        <span>{generation.resolution}</span>
        <span aria-hidden="true">·</span>
        <span>{generation.aspectRatio}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {generation.refunded
            ? "refunded"
            : `${generation.creditCost} ${generation.creditCost === 1 ? "credit" : "credits"}`}
        </span>
      </p>

      {generation.status === "succeeded" && generation.imageUrl ? (
        <div className="mt-auto grid border-border/70 border-t pt-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm">
              {shareToken ? (
                <Link2 aria-hidden="true" className="size-4" />
              ) : (
                <Link2Off
                  aria-hidden="true"
                  className="size-4 text-muted-foreground"
                />
              )}
              Public link
            </span>
            <Switch
              aria-label="Share this image publicly"
              checked={Boolean(shareToken)}
              disabled={busy}
              onCheckedChange={(checked) =>
                updateShare(checked === true, promptVisible)
              }
            />
          </div>

          <div
            className="disclosure"
            data-open={Boolean(shareToken)}
            inert={!shareToken}
          >
            <div>
              <div className="grid gap-3 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">
                    Show the prompt
                  </span>
                  <Switch
                    aria-label="Show the prompt on the shared page"
                    checked={promptVisible}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      updateShare(true, checked === true)
                    }
                  />
                </div>
                <Button
                  className="min-h-10 rounded-full"
                  onClick={copyLink}
                  type="button"
                  variant="outline"
                >
                  {copied ? (
                    <Check aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <Copy aria-hidden="true" data-icon="inline-start" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
