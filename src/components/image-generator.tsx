import { Link, useRouter } from "@tanstack/react-router";
import { ImagePlus, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import type { GenerationView } from "@/lib/generation.functions";
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_RESOLUTION,
  MAX_REFERENCE_IMAGES,
  RESOLUTION_TIERS,
  tierFor,
} from "@/lib/pricing";
import { MAX_IMAGE_BYTES, uploadReferenceImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";

/**
 * Where an in-flight attempt is remembered.
 *
 * The credits are taken before the model is called, so a tab that reloads
 * mid-generation must be able to find its way back to the image it paid for.
 * Replaying the same idempotency key returns the original attempt rather than
 * starting a second one. See ADR-0017.
 */
const IN_FLIGHT_KEY = "imagenation.inflight";
const IN_FLIGHT_MAX_AGE_MS = 15 * 60 * 1000;

type GenerateBody = {
  aspectRatio: string;
  prompt: string;
  referenceKeys: string[];
  resolution: string;
};

type InFlight = {
  at: number;
  body: GenerateBody;
  key: string;
};

type Reference = {
  objectKey: string;
  previewUrl: string;
};

function readInFlight(): InFlight | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(IN_FLIGHT_KEY);
    const parsed = raw ? (JSON.parse(raw) as InFlight) : null;

    if (!parsed || Date.now() - parsed.at > IN_FLIGHT_MAX_AGE_MS) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

async function postGenerate(key: string, body: GenerateBody) {
  const response = await fetch("/api/generate", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      // The same key always names the same attempt, so a retry never becomes a
      // second charge. See ADR-0002.
      "Idempotency-Key": key,
    },
    method: "POST",
  });

  const payload = (await response.json()) as {
    balance?: number;
    error?: string;
    generation?: GenerationView;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "The image could not be generated");
  }

  return payload.generation ?? null;
}

type ImageGeneratorProps = {
  balance: number;
  recent: GenerationView[];
  signedIn: boolean;
};

export function ImageGenerator({
  balance,
  recent,
  signedIn,
}: ImageGeneratorProps) {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState<string>(DEFAULT_RESOLUTION);
  const [aspectRatio, setAspectRatio] = useState<string>(DEFAULT_ASPECT_RATIO);
  const [references, setReferences] = useState<Reference[]>([]);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationView | null>(
    recent.find((item) => item.status === "succeeded") ?? null
  );
  const fileInput = useRef<HTMLInputElement>(null);

  const tier = tierFor(resolution);
  const cost = tier.credits;
  const affordable = balance >= cost;

  const run = useCallback(
    async (key: string, body: GenerateBody) => {
      setPending(true);
      setError(null);

      try {
        const generation = await postGenerate(key, body);

        if (generation) {
          setResult(generation);

          if (generation.status === "failed") {
            setError(
              generation.errorCode === "moderation"
                ? "That prompt was blocked, and the credits were not returned."
                : `${generation.errorMessage ?? "The image failed"}. Your credits were returned.`
            );
          }
        }

        window.localStorage.removeItem(IN_FLIGHT_KEY);
        // Refreshes the balance in the header and the strip below.
        await router.invalidate();
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : "Something went wrong"
        );
        window.localStorage.removeItem(IN_FLIGHT_KEY);
      } finally {
        setPending(false);
      }
    },
    [router]
  );

  // Rejoins an attempt this browser started and did not see finish.
  useEffect(() => {
    const inFlight = readInFlight();

    if (!(inFlight && signedIn)) {
      return;
    }

    setPrompt(inFlight.body.prompt);
    setResolution(inFlight.body.resolution);
    setAspectRatio(inFlight.body.aspectRatio);
    run(inFlight.key, inFlight.body);
  }, [run, signedIn]);

  function submit() {
    if (!(prompt.trim() && affordable) || pending) {
      return;
    }

    const body: GenerateBody = {
      aspectRatio,
      prompt: prompt.trim(),
      referenceKeys: references.map((reference) => reference.objectKey),
      resolution,
    };
    const key = crypto.randomUUID();

    window.localStorage.setItem(
      IN_FLIGHT_KEY,
      JSON.stringify({ at: Date.now(), body, key } satisfies InFlight)
    );

    run(key, body);
  }

  async function addReferences(input: HTMLInputElement) {
    const { files } = input;

    if (!files?.length) {
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const room = MAX_REFERENCE_IMAGES - references.length;
      const chosen = Array.from(files).slice(0, room);
      const uploaded = await Promise.all(
        chosen.map(async (file) => ({
          objectKey: await uploadReferenceImage(file),
          previewUrl: URL.createObjectURL(file),
        }))
      );

      setReferences((current) => [...current, ...uploaded]);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That image could not upload"
      );
    } finally {
      setUploading(false);
      // Cleared so choosing the same file twice still fires a change event.
      input.value = "";
    }
  }

  function removeReference(objectKey: string) {
    setReferences((current) => {
      const removed = current.find((item) => item.objectKey === objectKey);

      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      return current.filter((item) => item.objectKey !== objectKey);
    });
  }

  return (
    <div className="grid min-h-[calc(100dvh-8.5rem)] lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section
        aria-label="Image settings"
        className="border-border/70 border-b px-5 py-6 sm:px-8 lg:border-r lg:border-b-0"
      >
        <div className="grid gap-2">
          <Label htmlFor="prompt">Prompt</Label>
          <Textarea
            className="min-h-44 resize-y text-base"
            id="prompt"
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="A quiet neighbourhood storefront at blue hour, warm light spilling onto wet pavement."
            value={prompt}
          />
          <p className="text-muted-foreground text-xs">
            Enter to generate · Shift+Enter for a new line
          </p>
        </div>

        <div className="mt-6 grid gap-2">
          <div className="flex items-baseline justify-between">
            <Label htmlFor="references">Reference images</Label>
            <span className="text-muted-foreground text-xs">
              Free · up to {MAX_REFERENCE_IMAGES}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {references.map((reference) => (
              <span className="relative" key={reference.objectKey}>
                <img
                  alt=""
                  className="size-16 rounded-xl object-cover ring-1 ring-border"
                  src={reference.previewUrl}
                />
                <button
                  aria-label="Remove reference image"
                  className="-top-1.5 -right-1.5 absolute inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 ease-out-quint hover:scale-105 active:scale-95"
                  onClick={() => removeReference(reference.objectKey)}
                  type="button"
                >
                  <X aria-hidden="true" className="size-3" />
                </button>
              </span>
            ))}
            {references.length < MAX_REFERENCE_IMAGES ? (
              <button
                className="inline-flex size-16 flex-col items-center justify-center gap-1 rounded-xl border border-border border-dashed text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
                type="button"
              >
                {uploading ? (
                  <Spinner className="size-4" />
                ) : (
                  <ImagePlus aria-hidden="true" className="size-4" />
                )}
                Add
              </button>
            ) : null}
          </div>
          <input
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="sr-only"
            id="references"
            multiple
            onChange={(event) => addReferences(event.target)}
            ref={fileInput}
            type="file"
          />
          <p className="text-muted-foreground text-xs">
            PNG, JPEG, WebP or AVIF, up to{" "}
            {Math.round(MAX_IMAGE_BYTES / (1024 * 1024))}MB each.
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="resolution">Resolution</Label>
            <NativeSelect
              id="resolution"
              onChange={(event) => setResolution(event.target.value)}
              value={resolution}
            >
              {RESOLUTION_TIERS.map((option) => (
                <NativeSelectOption key={option.id} value={option.id}>
                  {option.label} · {option.credits}{" "}
                  {option.credits === 1 ? "credit" : "credits"}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-muted-foreground text-xs">
              {tier.sampleDimensions} at 16:9 · about {tier.typicalSeconds}s
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="aspect-ratio">Aspect ratio</Label>
            <NativeSelect
              id="aspect-ratio"
              onChange={(event) => setAspectRatio(event.target.value)}
              value={aspectRatio}
            >
              {ASPECT_RATIOS.map((option) => (
                <NativeSelectOption key={option} value={option}>
                  {option}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>

        {error ? (
          <p className="mt-6 text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex items-center gap-3">
          {signedIn ? (
            <Button
              className="min-h-11 flex-1 rounded-full"
              disabled={pending || !prompt.trim() || !affordable}
              onClick={submit}
              type="button"
            >
              {pending ? (
                <>
                  <Spinner className="size-4" />
                  Generating
                </>
              ) : (
                <>
                  Generate
                  <span aria-hidden="true" className="opacity-60">
                    ·
                  </span>
                  <span className="tabular-nums">{cost}</span>
                  {cost === 1 ? "credit" : "credits"}
                </>
              )}
            </Button>
          ) : (
            <Link
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-foreground px-5 text-background text-sm transition-[background-color,transform] duration-150 ease-out-quint hover:bg-foreground/85 active:scale-[0.96]"
              to="/auth"
            >
              Sign in to generate
            </Link>
          )}
          <Button
            aria-label="Clear the prompt"
            className="size-11 rounded-full"
            disabled={pending}
            onClick={() => {
              setPrompt("");
              setError(null);
            }}
            type="button"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
          </Button>
        </div>

        {signedIn && !affordable ? (
          <p className="mt-3 text-muted-foreground text-sm">
            This costs {cost} credits and you have {balance}.{" "}
            <Link className="underline underline-offset-4" to="/credits">
              Top up
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section
        aria-label="Result"
        className="flex flex-col gap-6 px-5 py-6 sm:px-8"
      >
        <ResultPane
          pending={pending}
          result={result}
          tierSeconds={tier.typicalSeconds}
        />

        {recent.length > 0 ? (
          <div>
            <div className="flex items-baseline justify-between">
              <h2 className="text-muted-foreground text-sm">Recent</h2>
              <Link
                className="text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
                to="/history"
              >
                All images
              </Link>
            </div>
            <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {recent.slice(0, 8).map((item) => (
                <li key={item.id}>
                  <button
                    className={cn(
                      "block size-20 overflow-hidden rounded-xl ring-1 ring-border transition-transform duration-150 ease-out-quint hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                      result?.id === item.id && "ring-2 ring-foreground"
                    )}
                    onClick={() => setResult(item)}
                    type="button"
                  >
                    {item.imageUrl ? (
                      <img
                        alt={item.prompt.slice(0, 80)}
                        className="size-full object-cover"
                        src={item.imageUrl}
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center bg-muted text-muted-foreground text-xs">
                        {item.status === "failed" ? "Failed" : "Gone"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ResultPane({
  pending,
  result,
  tierSeconds,
}: {
  pending: boolean;
  result: GenerationView | null;
  tierSeconds: number;
}) {
  if (pending) {
    return (
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-border border-dashed">
        <Spinner className="size-5" />
        <p className="text-muted-foreground text-sm">
          Making your image · about {tierSeconds}s
        </p>
        <p className="max-w-xs text-center text-muted-foreground text-xs">
          You can leave this page. The image finishes either way and lands in
          your history.
        </p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-2 rounded-3xl border border-border border-dashed px-6 text-center">
        <p className="font-heading font-medium text-2xl tracking-[-0.04em]">
          Describe it, and see it.
        </p>
        <p className="max-w-sm text-muted-foreground text-sm leading-6">
          Write what you want on the left. Add reference images if you want the
          model to follow a look.
        </p>
      </div>
    );
  }

  if (!result.imageUrl) {
    return (
      <div className="flex min-h-72 flex-1 flex-col items-center justify-center gap-2 rounded-3xl border border-border border-dashed px-6 text-center">
        <p className="font-medium">
          {result.status === "failed"
            ? "That one failed"
            : "That image is gone"}
        </p>
        <p className="max-w-sm text-muted-foreground text-sm leading-6">
          {result.status === "failed"
            ? (result.errorMessage ?? "Try a different prompt.")
            : "Images are deleted after 90 days unless you share them."}
        </p>
      </div>
    );
  }

  return (
    <figure className="flex flex-1 flex-col gap-3">
      <img
        alt={result.prompt.slice(0, 120)}
        className="w-full rounded-3xl bg-muted object-contain ring-1 ring-border"
        src={result.imageUrl}
      />
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
        <span>{result.resolution}</span>
        <span aria-hidden="true">·</span>
        <span>{result.aspectRatio}</span>
        <span aria-hidden="true">·</span>
        <span className="tabular-nums">
          {result.creditCost} {result.creditCost === 1 ? "credit" : "credits"}
        </span>
        <a
          className="ml-auto underline underline-offset-4 hover:text-foreground"
          download
          href={result.imageUrl}
        >
          Download
        </a>
      </figcaption>
    </figure>
  );
}
