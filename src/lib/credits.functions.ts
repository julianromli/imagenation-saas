import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

import { getAuth } from "@/lib/auth";
import { listEntries, readBalance } from "@/lib/credits";

async function currentUserId() {
  const session = await getAuth().api.getSession({
    headers: getRequestHeaders(),
  });

  return session?.user.id ?? null;
}

/**
 * The balance, and the signup grant if it has not been given yet.
 *
 * Reading the balance is what triggers the grant, so a new account has its
 * credits the first time it sees the app. See ADR-0016.
 */
export const getBalanceSummary = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await currentUserId();

    if (!userId) {
      return { balance: 0, signedIn: false as const };
    }

    return { balance: await readBalance(userId), signedIn: true as const };
  }
);

export const listCreditHistory = createServerFn({ method: "GET" }).handler(
  async () => {
    const userId = await currentUserId();

    if (!userId) {
      throw new Error("Unauthorized");
    }

    const entries = await listEntries(userId);

    return entries.map((entry) => ({
      createdAt: entry.createdAt.getTime(),
      delta: entry.delta,
      id: entry.id,
      note: entry.note,
      reason: entry.reason,
    }));
  }
);
