import { z } from "zod";

import type { GENERATION_ERROR } from "@/db/schema";
import { IMAGE_MODEL } from "@/lib/pricing";
import { requireEnv } from "@/lib/runtime-env";

const API_BASE = "https://openrouter.ai/api/v1";

/** 4K measured at 29 seconds. This leaves room for a slow provider. */
const REQUEST_TIMEOUT_MS = 120_000;

const imageResponseSchema = z.object({
  data: z
    .array(
      z.object({
        b64_json: z.string(),
        media_type: z.string(),
      })
    )
    .min(1),
  usage: z
    .object({
      cost: z.number().optional(),
    })
    .optional(),
});

const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export type GenerationErrorCode = (typeof GENERATION_ERROR)[number];

/**
 * A failure with the one fact the ledger needs: which code it is. Whether the
 * credits come back is decided from `code`, never from the message.
 */
export class ImageGenerationError extends Error {
  readonly code: GenerationErrorCode;

  constructor(
    code: GenerationErrorCode,
    message: string,
    options?: { cause?: unknown }
  ) {
    super(message, options);
    this.code = code;
    this.name = "ImageGenerationError";
  }
}

/**
 * Phrases the provider uses when it refuses the prompt itself.
 *
 * A 400 covers both a blocked prompt and a malformed request, and only one of
 * those is the user's doing. The default is therefore `invalid`, which
 * refunds: charging someone for our own bad request is worse than
 * occasionally refunding a blocked prompt. Widen this list when a real block
 * shows up in the logs with different wording.
 */
const MODERATION_PHRASES = [
  "content policy",
  "content_policy",
  "moderation",
  "safety",
  "blocked",
  "prohibited",
  "violat",
];

function classify(status: number, message: string): GenerationErrorCode {
  if (status === 400) {
    const lowered = message.toLowerCase();

    return MODERATION_PHRASES.some((phrase) => lowered.includes(phrase))
      ? "moderation"
      : "invalid";
  }

  if (status === 429) {
    return "rate_limited";
  }

  // 401, 402, 403, 404, 413, 502 and anything else are ours or the provider's
  // to fix, never the user's. They refund.
  return "upstream";
}

async function readError(response: Response) {
  try {
    const body = (await response.json()) as {
      error?: { code?: number; message?: string };
    };

    return body.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

function authHeaders() {
  return {
    Authorization: `Bearer ${requireEnv("OPENROUTER_API_KEY")}`,
    "Content-Type": "application/json",
    "X-Title": "Imagenation",
  };
}

export type GenerateImageInput = {
  aspectRatio: string;
  prompt: string;
  /** Data URLs. The bucket is private, so the provider cannot fetch our keys. */
  referenceUrls: string[];
  resolution: string;
};

export type GeneratedImage = {
  base64: string;
  costUsd: number | null;
  mediaType: string;
};

export async function generateImage(
  input: GenerateImageInput
): Promise<GeneratedImage> {
  const body = {
    aspect_ratio: input.aspectRatio,
    model: IMAGE_MODEL,
    n: 1,
    prompt: input.prompt,
    resolution: input.resolution,
    ...(input.referenceUrls.length > 0
      ? {
          input_references: input.referenceUrls.map((url) => ({
            image_url: { url },
            type: "image_url" as const,
          })),
        }
      : {}),
  };

  let response: Response;

  try {
    response = await fetch(`${API_BASE}/images`, {
      body: JSON.stringify(body),
      headers: authHeaders(),
      method: "POST",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network failure";

    // biome-ignore lint/style/useErrorCause: The cause is passed, as the third argument, because the first carries the error code.
    throw new ImageGenerationError("timeout", message, { cause: error });
  }

  if (!response.ok) {
    const message = await readError(response);

    throw new ImageGenerationError(classify(response.status, message), message);
  }

  const parsed = imageResponseSchema.safeParse(await response.json());

  if (!parsed.success) {
    throw new ImageGenerationError(
      "upstream",
      "The image service returned a response we could not read"
    );
  }

  const [image] = parsed.data.data;

  return {
    base64: image.b64_json,
    costUsd: parsed.data.usage?.cost ?? null,
    // Never assume PNG. This model returns PNG below 2K and JPEG at or above
    // it, and the stored extension has to follow the response.
    mediaType: image.media_type,
  };
}

/**
 * Confirms the key works and the model is reachable, without generating an
 * image or spending anything. `/setup` calls this so a wrong key is found at
 * setup time rather than by the first paying user.
 */
export async function verifyImageModelAccess() {
  const response = await fetch(`${API_BASE}/images/models`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    return {
      message: await readError(response),
      ok: false as const,
    };
  }

  const parsed = modelListSchema.safeParse(await response.json());

  if (!parsed.success) {
    return {
      message: "The model list could not be read",
      ok: false as const,
    };
  }

  const available = parsed.data.data.some((model) =>
    model.id.startsWith(IMAGE_MODEL)
  );

  return available
    ? { ok: true as const }
    : {
        message: `${IMAGE_MODEL} is not available to this key`,
        ok: false as const,
      };
}
