import { and, eq, gt, sql } from "drizzle-orm";

import { getDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";
import { hashToken } from "@/lib/ids";

export async function consumeRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const windowStart = Math.floor(Date.now() / input.windowMs) * input.windowMs;
  const bucketId = await hashToken(`${input.key}:${windowStart}`);
  const expiresAt = new Date(windowStart + input.windowMs);
  const db = getDb();

  await db
    .insert(rateLimitBuckets)
    .values({
      expiresAt,
      id: bucketId,
      requestCount: 1,
    })
    .onConflictDoUpdate({
      set: {
        requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
        updatedAt: new Date(),
      },
      target: rateLimitBuckets.id,
    });

  const [bucket] = await db
    .select({ requestCount: rateLimitBuckets.requestCount })
    .from(rateLimitBuckets)
    .where(
      and(
        eq(rateLimitBuckets.id, bucketId),
        gt(rateLimitBuckets.expiresAt, new Date())
      )
    )
    .limit(1);

  if ((bucket?.requestCount ?? Number.POSITIVE_INFINITY) > input.limit) {
    throw new Error("Too many attempts. Wait a minute and try again.");
  }
}
