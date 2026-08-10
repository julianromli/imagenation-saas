/**
 * Every number that decides what a generation costs you and what it costs a
 * user. Repricing is one edit in this file.
 *
 * The credit ladder is proportional to measured upstream cost, not to pixel
 * count. See ADR-0018 for the measurements and the arithmetic behind it.
 */

/**
 * Deliberately unpinned. A dated model id eventually retires and takes the app
 * down with it, while a price change is recoverable — provided you can see it.
 * `costCeilingUsd` below is how you see it. See ADR-0018.
 */
export const IMAGE_MODEL = "google/gemini-3.1-flash-image";

/**
 * The rate the price table was planned against. Revenue is in IDR and the
 * upstream bill is in USD, so a weaker rupiah compresses every margin here.
 * Used for cost reporting in the admin, never for charging a user.
 */
export const PLANNING_USD_TO_IDR = 18_000;

export type ResolutionTier = {
  /** What one image at this tier costs the user. */
  credits: number;
  /**
   * Measured upstream cost in USD, 16:9, short prompt, no references.
   * Recorded so a future reprice starts from evidence.
   */
  costUsd: number;
  /**
   * Log loudly above this. Set with headroom for longer prompts and reference
   * images, tight enough to catch the model getting more expensive.
   */
  costCeilingUsd: number;
  id: "1K" | "2K" | "4K";
  label: string;
  /** Output size at 16:9. Other ratios differ; this is the reference point. */
  sampleDimensions: string;
  /** Measured wall clock, rounded. Shown in the UI before the user commits. */
  typicalSeconds: number;
};

/**
 * The default, and the anchor of the whole ladder. Every other tier is priced
 * in proportion to this one's measured cost. See ADR-0018.
 */
export const DEFAULT_TIER: ResolutionTier = {
  costCeilingUsd: 0.1,
  costUsd: 0.0672,
  credits: 2,
  id: "1K",
  label: "1K",
  sampleDimensions: "1376×768",
  typicalSeconds: 11,
};

export const RESOLUTION_TIERS: ResolutionTier[] = [
  DEFAULT_TIER,
  {
    costCeilingUsd: 0.15,
    costUsd: 0.102,
    credits: 3,
    id: "2K",
    label: "2K",
    sampleDimensions: "2752×1536",
    typicalSeconds: 14,
  },
  {
    costCeilingUsd: 0.23,
    costUsd: 0.1524,
    credits: 5,
    id: "4K",
    label: "4K",
    sampleDimensions: "5504×3072",
    typicalSeconds: 30,
  },
];

export const DEFAULT_RESOLUTION = DEFAULT_TIER.id;
export const DEFAULT_ASPECT_RATIO = "16:9";

/**
 * The ratios the model accepts. All of them are offered: the cost of a wide
 * banner is the same as the cost of a square.
 */
export const ASPECT_RATIOS = [
  "1:1",
  "16:9",
  "9:16",
  "4:3",
  "3:4",
  "3:2",
  "2:3",
  "5:4",
  "4:5",
  "21:9",
  "4:1",
  "1:4",
  "8:1",
  "1:8",
] as const;

export type AspectRatio = (typeof ASPECT_RATIOS)[number];
export type ResolutionId = ResolutionTier["id"];

/**
 * Reference images are free. Measured: a 1K generation costs $0.0672 with no
 * references, $0.0678 with one, and $0.0682 with three. Charging for them
 * would be inventing a fee. See ADR-0018.
 */
export const MAX_REFERENCE_IMAGES = 14;

export type CreditPack = {
  amount: number;
  credits: number;
  id: string;
  name: string;
};

/**
 * Sold as Mayar invoices, built at request time. Nothing here is provisioned
 * on the Mayar account, which is what keeps this template free of
 * account-specific ids. See ADR-0019.
 *
 * Do not price below 1,400 IDR per credit. At that floor a 1K generation
 * returns 2,800 IDR against roughly 1,210 IDR of upstream cost, and the rest
 * pays for Cloudflare, refunds, and the signup grant.
 */
export const MIN_IDR_PER_CREDIT = 1400;

export const CREDIT_PACKS: CreditPack[] = [
  { amount: 35_000, credits: 20, id: "starter", name: "Starter" },
  { amount: 95_000, credits: 60, id: "standard", name: "Standard" },
  { amount: 280_000, credits: 200, id: "pro", name: "Pro" },
];

/**
 * Credits given once, on signup. Two 1K generations — enough to see the
 * product work twice. Costs roughly $0.13 per account, and there is no email
 * verification, so the signup rate limiter is what keeps that bounded.
 */
export const SIGNUP_GRANT_CREDITS = 4;

/** Generated images are deleted after this, unless the owner shared them. */
export const IMAGE_RETENTION_DAYS = 90;

/** A pending generation older than this is presumed dead and refunded. */
export const GENERATION_TIMEOUT_MINUTES = 10;

/** Moderation blocks keep the credits. Too many in a row stops the account. */
export const MODERATION_STRIKE_LIMIT = 3;
export const MODERATION_STRIKE_WINDOW_MINUTES = 60;

export function findTier(id: string): ResolutionTier | undefined {
  return RESOLUTION_TIERS.find((tier) => tier.id === id);
}

/**
 * The tier for an id, falling back to the default.
 *
 * For rendering only. Charging goes through `creditCostFor`, which refuses an
 * unknown id rather than quietly billing the default price for it.
 */
export function tierFor(id: string): ResolutionTier {
  return findTier(id) ?? DEFAULT_TIER;
}

export function findPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((pack) => pack.id === id);
}

/**
 * What a generation costs in credits. Reference images add nothing, which is
 * why they are not an argument.
 */
export function creditCostFor(resolution: string) {
  const tier = findTier(resolution);

  if (!tier) {
    throw new Error(`Unknown resolution: ${resolution}`);
  }

  return tier.credits;
}

export function idrPerCredit(pack: CreditPack) {
  return Math.round(pack.amount / pack.credits);
}
