import { env } from "cloudflare:workers";

import { RateLimitError } from "@/lib/errors";

/**
 * Rate limits run on the Cloudflare binding rather than on database counters.
 * Counting is per Cloudflare location and deliberately permissive, which is
 * enough for these paths. See ADR-0015.
 */
export type LimiterName =
  | "CHECKOUT_LIMITER"
  | "ORDER_CLAIM_LIMITER"
  | "ORDER_LOOKUP_LIMITER"
  | "PAYMENT_REFRESH_LIMITER"
  | "SETUP_LIMITER"
  | "WEBHOOK_LIMITER";

export async function consumeRateLimit(limiter: LimiterName, key: string) {
  const { success } = await env[limiter].limit({ key });

  if (!success) {
    throw new RateLimitError("Too many attempts. Wait a minute and try again.");
  }
}
