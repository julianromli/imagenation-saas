import { and, eq, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { setupMetadata } from "@/db/schema";
import { createAccessToken, createId } from "@/lib/ids";

export const WEBHOOK_SECRET_KEY = "mayar_webhook_secret";
export const SETUP_COMPLETED_KEY = "setup_completed";
export const SETUP_CLAIM_KEY = "setup_claim";
export const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";
export const AUTH_SECRET_KEY = "auth_secret";

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

/**
 * The secret Better Auth signs session cookies with.
 *
 * Generated once on first use and then read from this table, so a one-click
 * deploy has nothing to configure and restarts keep every session valid. The
 * unique index on `key` settles the first-boot race: a concurrent writer
 * inserts nothing and reads back the winner's value instead of using its own
 * candidate. See ADR-0023.
 */
export async function getOrCreateAuthSecret() {
  const stored = await readSetupValue(AUTH_SECRET_KEY);

  if (typeof stored?.secret === "string") {
    return stored.secret;
  }

  await getDb()
    .insert(setupMetadata)
    .values({
      id: createId(),
      key: AUTH_SECRET_KEY,
      value: { secret: createAccessToken() },
    })
    .onConflictDoNothing();

  const winner = await readSetupValue(AUTH_SECRET_KEY);

  if (typeof winner?.secret !== "string") {
    // A replica that has not seen the winning insert yet answers null. Rare,
    // and the next request succeeds.
    throw new Error("Auth secret is not readable yet. Retry the request.");
  }

  return winner.secret;
}
