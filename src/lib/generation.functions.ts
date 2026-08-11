import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { generations } from "@/db/schema";
import { getAuth } from "@/lib/auth";
import type { GenerationRow } from "@/lib/generation";
import { createAccessToken } from "@/lib/ids";
import { generationImageUrl } from "@/lib/images";
import { shareSchema } from "@/lib/validation";

const HISTORY_LIMIT = 60;

export type GenerationView = {
  aspectRatio: string;
  createdAt: number;
  creditCost: number;
  errorCode: string | null;
  errorMessage: string | null;
  id: string;
  imageUrl: string | null;
  prompt: string;
  refunded: boolean;
  resolution: string;
  sharePromptVisible: boolean;
  shareToken: string | null;
  status: string;
};

export function toGenerationView(row: GenerationRow): GenerationView {
  return {
    aspectRatio: row.aspectRatio,
    createdAt: row.createdAt.getTime(),
    creditCost: row.creditCost,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    id: row.id,
    imageUrl: generationImageUrl(row.objectKey),
    prompt: row.prompt,
    refunded: row.refundedAt !== null,
    resolution: row.resolution,
    sharePromptVisible: row.sharePromptVisible,
    shareToken: row.shareToken,
    status: row.status,
  };
}

async function requireUserId() {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session.user.id;
}

export const listGenerations = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await requireUserId();
    const rows = await getDb().query.generations.findMany({
      limit: HISTORY_LIMIT,
      orderBy: desc(generations.createdAt),
      where: eq(generations.userId, userId),
    });

    return rows.map(toGenerationView);
  }
);

/**
 * Reads a shared image for anybody holding the link. No session.
 *
 * Only what the page renders is returned. The prompt is withheld unless its
 * owner chose to show it, and the owner's identity is never included.
 * See ADR-0020.
 */
export type SharedGenerationView = {
  aspectRatio: string;
  createdAt: number;
  imageUrl: string;
  prompt: string | null;
  resolution: string;
};

export const getSharedGeneration = createServerFn({ method: "GET" })
  .validator((token: string) => token)
  .handler(async ({ data: token }): Promise<SharedGenerationView | null> => {
    const row = await getDb().query.generations.findFirst({
      where: and(
        eq(generations.shareToken, token),
        eq(generations.status, "succeeded")
      ),
    });

    if (!row?.objectKey) {
      return null;
    }

    return {
      aspectRatio: row.aspectRatio,
      createdAt: row.createdAt.getTime(),
      imageUrl: `/api/shared/${token}`,
      prompt: row.sharePromptVisible ? row.prompt : null,
      resolution: row.resolution,
    };
  });

/**
 * Turns sharing on or off for one image.
 *
 * Turning it on mints a token; turning it off deletes it, and the public path
 * stops resolving at once. Presence of a token is also what exempts the image
 * from the retention sweep, so a link handed to somebody does not rot.
 * See ADR-0020.
 */
export const setGenerationShare = createServerFn({ method: "POST" })
  .validator(shareSchema)
  .handler(async ({ data }) => {
    const userId = await requireUserId();
    const row = await getDb().query.generations.findFirst({
      where: and(
        eq(generations.id, data.generationId),
        eq(generations.userId, userId)
      ),
    });

    if (!row) {
      throw new Error("Unknown image");
    }

    if (row.status !== "succeeded") {
      throw new Error("That image is not finished");
    }

    const shareToken = data.shared
      ? (row.shareToken ?? createAccessToken())
      : null;

    await getDb()
      .update(generations)
      .set({
        sharePromptVisible: data.promptVisible,
        shareToken,
        updatedAt: new Date(),
      })
      .where(eq(generations.id, row.id));

    return { sharePromptVisible: data.promptVisible, shareToken };
  });
