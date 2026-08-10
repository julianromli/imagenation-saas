import { env } from "cloudflare:workers";
import { and, count, eq, gt } from "drizzle-orm";

import { getDb, runBatch } from "@/db";
import { generationRequests, generations } from "@/db/schema";
import { base64ToBytes, bytesToBase64 } from "@/lib/base64";
import { ensureAccountStatement, ledgerStatements } from "@/lib/credits";
import {
  ConflictError,
  ForbiddenError,
  InsufficientCreditsError,
  InvalidRequestError,
} from "@/lib/errors";
import { createId } from "@/lib/ids";
import { generateImage, ImageGenerationError } from "@/lib/openrouter";
import {
  creditCostFor,
  findTier,
  IMAGE_MODEL,
  MODERATION_STRIKE_LIMIT,
  MODERATION_STRIKE_WINDOW_MINUTES,
} from "@/lib/pricing";
import {
  extensionForMediaType,
  GENERATION_IMAGE_PREFIX,
  MAX_TOTAL_REFERENCE_BYTES,
  REFERENCE_IMAGE_PREFIX,
} from "@/lib/uploads";
import type { GenerateInput } from "@/lib/validation";

export type GenerationRow = typeof generations.$inferSelect;

const REF_TYPE = "generation";

/**
 * Turns a D1 batch failure into the reason a user can act on.
 *
 * The guards live in the schema rather than in application code, so this is
 * where they are read back. A message that matches nothing here is a real
 * fault and is rethrown untouched. See ADR-0016.
 */
function translateBatchFailure(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("credit_account_balance_not_negative")) {
    throw new InsufficientCreditsError(
      "You do not have enough credits for this image"
    );
  }

  if (
    message.includes("generation_one_pending_per_user") ||
    message.includes("generation.user_id")
  ) {
    throw new ConflictError(
      "One image is already generating. Wait for it to finish."
    );
  }

  throw error;
}

function assertOwnedReferences(userId: string, referenceKeys: string[]) {
  const prefix = `${REFERENCE_IMAGE_PREFIX}${userId}/`;

  for (const key of referenceKeys) {
    if (!key.startsWith(prefix)) {
      throw new InvalidRequestError("A reference image is not yours to use");
    }
  }
}

/**
 * Reads reference images back out of R2 as data URLs.
 *
 * The bucket is private, so a URL cannot be handed to the provider — the bytes
 * have to travel in the request. Reading them here rather than accepting them
 * from the browser also means the caller cannot aim the provider at a URL of
 * their choosing.
 */
async function readReferences(referenceKeys: string[]) {
  const urls: string[] = [];
  let total = 0;

  for (const key of referenceKeys) {
    // biome-ignore lint/performance/noAwaitInLoops: The running total is what bounds memory, so these reads are deliberately sequential.
    const object = await env.BUCKET.get(key);

    if (!object) {
      throw new InvalidRequestError("A reference image is no longer available");
    }

    const bytes = new Uint8Array(await object.arrayBuffer());

    total += bytes.byteLength;

    if (total > MAX_TOTAL_REFERENCE_BYTES) {
      throw new InvalidRequestError("Those reference images are too large");
    }

    const contentType = object.httpMetadata?.contentType ?? "image/png";

    urls.push(`data:${contentType};base64,${bytesToBase64(bytes)}`);
  }

  return urls;
}

/**
 * Refuses an account that keeps tripping the provider's content filter.
 *
 * A moderation block keeps the credits, so without this the cheapest way to
 * probe the filter is to keep probing. Every other failure refunds and is not
 * counted here.
 */
async function assertNotModerationLocked(userId: string) {
  const since = new Date(
    Date.now() - MODERATION_STRIKE_WINDOW_MINUTES * 60 * 1000
  );

  const [row] = await getDb()
    .select({ strikes: count() })
    .from(generations)
    .where(
      and(
        eq(generations.userId, userId),
        eq(generations.errorCode, "moderation"),
        gt(generations.createdAt, since)
      )
    );

  if ((row?.strikes ?? 0) >= MODERATION_STRIKE_LIMIT) {
    throw new ForbiddenError(
      "Too many prompts were blocked. Try again in an hour."
    );
  }
}

async function findByIdempotencyKey(userId: string, key: string) {
  const request = await getDb().query.generationRequests.findFirst({
    where: and(
      eq(generationRequests.id, key),
      eq(generationRequests.userId, userId)
    ),
  });

  if (!request) {
    return null;
  }

  return (
    (await getDb().query.generations.findFirst({
      where: eq(generations.id, request.generationId),
    })) ?? null
  );
}

export type StartGenerationResult = {
  generation: GenerationRow;
  /** True when this request repeated one already accepted. Nothing was charged. */
  replayed: boolean;
};

/**
 * Writes the job row and takes the credits, in one batch.
 *
 * Nothing here calls the model. The row exists before any money is spent
 * upstream, which is what makes a closed tab, a crash, and a refund all
 * recoverable. See ADR-0017.
 */
export async function startGeneration(input: {
  idempotencyKey: string | null;
  request: GenerateInput;
  userId: string;
}): Promise<StartGenerationResult> {
  const { request, userId } = input;
  const idempotencyKey = input.idempotencyKey?.trim();

  if (!idempotencyKey) {
    throw new InvalidRequestError("This request needs an Idempotency-Key");
  }

  const replay = await findByIdempotencyKey(userId, idempotencyKey);

  if (replay) {
    return { generation: replay, replayed: true };
  }

  assertOwnedReferences(userId, request.referenceKeys);
  await assertNotModerationLocked(userId);

  const creditCost = creditCostFor(request.resolution);
  const db = getDb();
  const generationId = createId();
  const row: typeof generations.$inferInsert = {
    aspectRatio: request.aspectRatio,
    creditCost,
    id: generationId,
    model: IMAGE_MODEL,
    prompt: request.prompt,
    referenceKeys: request.referenceKeys,
    resolution: request.resolution,
    status: "pending",
    userId,
  };

  try {
    await runBatch([
      ensureAccountStatement(userId),
      db.insert(generations).values(row),
      db.insert(generationRequests).values({
        fingerprint: `${request.resolution}:${request.aspectRatio}:${request.prompt.length}`,
        generationId,
        id: idempotencyKey,
        userId,
      }),
      ...ledgerStatements({
        delta: -creditCost,
        reason: "spend",
        refId: generationId,
        refType: REF_TYPE,
        userId,
      }),
    ]);
  } catch (error) {
    // A racing duplicate of the same key lost the insert. It is still the same
    // attempt, so return the winner rather than reporting a failure.
    const raced = await findByIdempotencyKey(userId, idempotencyKey);

    if (raced) {
      return { generation: raced, replayed: true };
    }

    translateBatchFailure(error);
  }

  const created = await db.query.generations.findFirst({
    where: eq(generations.id, generationId),
  });

  if (!created) {
    throw new Error("The generation row vanished after it was written");
  }

  return { generation: created, replayed: false };
}

function refundStatements(generation: GenerationRow) {
  return [
    ...ledgerStatements({
      delta: generation.creditCost,
      note: generation.errorCode ?? "failed",
      reason: "refund",
      refId: generation.id,
      refType: REF_TYPE,
      userId: generation.userId,
    }),
    getDb()
      .update(generations)
      .set({ refundedAt: new Date(), updatedAt: new Date() })
      .where(eq(generations.id, generation.id)),
  ];
}

async function recordFailure(
  generation: GenerationRow,
  code: (typeof generations.$inferSelect)["errorCode"],
  message: string
) {
  const now = new Date();
  const failure = getDb()
    .update(generations)
    .set({
      completedAt: now,
      errorCode: code,
      errorMessage: message.slice(0, 500),
      status: "failed",
      updatedAt: now,
    })
    .where(eq(generations.id, generation.id));

  // A blocked prompt keeps the credits. Everything else is ours or the
  // provider's fault and refunds. See ADR-0017.
  if (code === "moderation") {
    await runBatch([failure]);

    return;
  }

  try {
    await runBatch([
      failure,
      ...refundStatements({ ...generation, errorCode: code }),
    ]);
  } catch (error) {
    // The unique ref index refused a second refund, which means one is already
    // recorded. Still mark the row as failed.
    console.error("Refund was refused, marking the failure alone", error);
    await runBatch([failure]);
  }
}

/**
 * Calls the model and settles the job row. Never throws: it runs inside
 * `waitUntil`, where a rejection would be lost and the row would stay pending
 * until the cron swept it.
 */
export async function executeGeneration(
  generationId: string
): Promise<GenerationRow> {
  const db = getDb();
  const generation = await db.query.generations.findFirst({
    where: eq(generations.id, generationId),
  });

  if (!generation) {
    throw new Error(`Unknown generation: ${generationId}`);
  }

  if (generation.status !== "pending") {
    return generation;
  }

  try {
    const referenceUrls = await readReferences(generation.referenceKeys);
    const image = await generateImage({
      aspectRatio: generation.aspectRatio,
      prompt: generation.prompt,
      referenceUrls,
      resolution: generation.resolution,
    });

    const extension = extensionForMediaType(image.mediaType);
    const objectKey = `${GENERATION_IMAGE_PREFIX}${generation.userId}/${generation.id}.${extension}`;

    await env.BUCKET.put(objectKey, base64ToBytes(image.base64), {
      httpMetadata: { contentType: image.mediaType },
    });

    const tier = findTier(generation.resolution);

    if (tier && image.costUsd !== null && image.costUsd > tier.costCeilingUsd) {
      // The price table was set from measured cost. If this fires, the table is
      // out of date and every sale at this tier is thinner than it looks.
      console.error(
        `Generation cost $${image.costUsd} at ${tier.id}, above the $${tier.costCeilingUsd} ceiling. Reprice src/lib/pricing.ts.`
      );
    }

    const now = new Date();

    await db
      .update(generations)
      .set({
        completedAt: now,
        mediaType: image.mediaType,
        objectKey,
        status: "succeeded",
        updatedAt: now,
        upstreamCostUsd: image.costUsd,
      })
      .where(eq(generations.id, generation.id));
  } catch (error) {
    if (error instanceof ImageGenerationError) {
      await recordFailure(generation, error.code, error.message);
    } else if (error instanceof InvalidRequestError) {
      await recordFailure(generation, "invalid", error.message);
    } else {
      console.error("Generation failed unexpectedly", error);
      await recordFailure(
        generation,
        "upstream",
        error instanceof Error ? error.message : "Unknown failure"
      );
    }
  }

  const settled = await db.query.generations.findFirst({
    where: eq(generations.id, generation.id),
  });

  return settled ?? generation;
}

/** Refunds a job the cron found abandoned. Used by the scheduled sweep. */
export async function abandonGeneration(generation: GenerationRow) {
  await recordFailure(
    generation,
    "timeout",
    "The image did not arrive in time and the credits were returned"
  );
}
