import { eq } from "drizzle-orm";

import { getDb } from "@/db";
import { setupMetadata } from "@/db/schema";
import { createId } from "@/lib/ids";

export const WEBHOOK_SECRET_KEY = "mayar_webhook_secret";
export const SETUP_COMPLETED_KEY = "setup_completed";

export async function readSetupValue(key: string) {
  const [row] = await getDb()
    .select({ value: setupMetadata.value })
    .from(setupMetadata)
    .where(eq(setupMetadata.key, key))
    .limit(1);

  return row?.value ?? null;
}

export async function writeSetupValue(
  key: string,
  value: Record<string, string>
) {
  const db = getDb();
  const existing = await readSetupValue(key);

  if (existing) {
    await db
      .update(setupMetadata)
      .set({ updatedAt: new Date(), value })
      .where(eq(setupMetadata.key, key));

    return;
  }

  await db.insert(setupMetadata).values({ id: createId(), key, value });
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
