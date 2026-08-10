import { z } from "zod";

import {
  ASPECT_RATIOS,
  MAX_REFERENCE_IMAGES,
  RESOLUTION_TIERS,
} from "@/lib/pricing";

/**
 * A prompt long enough to be useful and short enough that it cannot be used to
 * push the request body around. The model charges for prompt tokens, so this
 * is a cost limit as much as a validation rule.
 */
export const MAX_PROMPT_LENGTH = 4000;

const resolutionIds = RESOLUTION_TIERS.map((tier) => tier.id) as [
  string,
  ...string[],
];

export const generateSchema = z.object({
  aspectRatio: z.enum(ASPECT_RATIOS),
  prompt: z.string().trim().min(1).max(MAX_PROMPT_LENGTH),
  // R2 object keys, not addresses and not image data. The server reads the
  // bytes back itself, so a caller cannot point this at somebody else's image
  // or at a URL of their choosing.
  referenceKeys: z
    .array(z.string().min(1))
    .max(MAX_REFERENCE_IMAGES)
    .default([]),
  resolution: z.enum(resolutionIds),
});

export const shareSchema = z.object({
  generationId: z.string().min(1),
  promptVisible: z.boolean().default(true),
  shared: z.boolean(),
});

export const creditAdjustmentSchema = z.object({
  credits: z
    .number()
    .int()
    .min(-10_000)
    .max(10_000)
    .refine((value) => value !== 0, {
      message: "An adjustment of zero changes nothing",
    }),
  note: z.string().trim().min(3).max(200),
  userId: z.string().min(1),
});

export type GenerateInput = z.infer<typeof generateSchema>;
