import { and, eq, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { setupMetadata } from "@/db/schema";
import { createId } from "@/lib/ids";

export const WEBHOOK_SECRET_KEY = "mayar_webhook_secret";
export const SETUP_COMPLETED_KEY = "setup_completed";
export const SETUP_CLAIM_KEY = "setup_claim";

// A claim this old belonged to a run that died before it could finish or clean
// up. Without a takeover window a crashed setup would lock the store forever.
const STALE_CLAIM_MS = 15 * 60 * 1000;

export async function readSetupValue(key: string) {
  const [row] = await getDb()
    .select({ value: setupMetadata.value })
    .from(setupMetadata)
    .where(eq(setupMetadata.key, key))
    .limit(1);

  return row?.value ?? null;
}

/**
 * Writes one row per key.
 *
 * The unique index on `key` decides the outcome, so two concurrent writers
 * cannot leave two rows behind for `readSetupValue` to choose between.
 */
export function writeSetupValue(key: string, value: Record<string, string>) {
  return getDb()
    .insert(setupMetadata)
    .values({ id: createId(), key, value })
    .onConflictDoUpdate({
      set: { updatedAt: new Date(), value },
      target: setupMetadata.key,
    });
}

/**
 * Takes the setup claim, or reports that somebody else holds it.
 *
 * Setup creates an administrator through Better Auth, which writes on its own
 * and cannot join a D1 batch. The mutex therefore lives in this row: the unique
 * index means exactly one concurrent request wins the insert.
 */
export async function claimSetup(now = new Date()) {
  const db = getDb();
  const claimedAt = now.toISOString();
  const inserted = await db
    .insert(setupMetadata)
    .values({
      id: createId(),
      key: SETUP_CLAIM_KEY,
      value: { claimedAt },
    })
    .onConflictDoNothing()
    .returning({ id: setupMetadata.id });

  if (inserted.length > 0) {
    return true;
  }

  // Somebody holds it. Take it over only if their run is old enough to be dead.
  const takenOver = await db
    .update(setupMetadata)
    .set({ updatedAt: now, value: { claimedAt } })
    .where(
      and(
        eq(setupMetadata.key, SETUP_CLAIM_KEY),
        lt(setupMetadata.updatedAt, new Date(now.getTime() - STALE_CLAIM_MS))
      )
    )
    .returning({ id: setupMetadata.id });

  return takenOver.length > 0;
}

/** Frees the claim so a failed run can be retried. */
export function releaseSetupClaim() {
  return getDb()
    .delete(setupMetadata)
    .where(eq(setupMetadata.key, SETUP_CLAIM_KEY));
}

/**
 * The unguessable segment in the Mayar webhook path.
 *
 * Mayar sends no signature header, so without this the endpoint has no way to
 * tell Mayar from a stranger. The secret is generated during setup and shown on
 * the setup page for registration. See ADR-0005.
 */
export async function readWebhookSecret() {
  const stored = await readSetupValue(WEBHOOK_SECRET_KEY);
  const secret = stored?.secret;

  return typeof secret === "string" ? secret : null;
}
