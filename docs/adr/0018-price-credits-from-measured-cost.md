# Price credits from measured cost

The credit ladder is proportional to what an image actually costs upstream, not to its pixel count. These are the measurements it was set from. Keep them here: they cannot be recovered later, and a future reprice that starts from a guess will be wrong.

**Measured, `google/gemini-3.1-flash-image` through OpenRouter, same prompt, 16:9, no reference images:**

| tier | output | format | cost USD | wall clock |
| --- | --- | --- | --- | --- |
| 512 | 688×384 | PNG | $0.0448 | 10.9s |
| 1K | 1376×768 | PNG | $0.0672 | 11.2s |
| 2K | 2752×1536 | JPEG | $0.1020 | 14.3s |
| 4K | 5504×3072 | JPEG | $0.1524 | 29.3s |

Cost scales 1.00 / 1.50 / 2.28 / 3.40 across those tiers — it does not double per step.

**Reference images are free.** A 1K generation costs $0.0672 with none, $0.0678 with one, and $0.0682 with three. Charging per reference would be inventing a fee.

**The 512 tier is not offered.** It is only 25% cheaper to produce than 1K, and any credit price that made it attractive would make it the worst value we sell: at 1 credit it costs $0.0448 per credit collected against $0.0336 at 1K, so a user optimising for their own money would spam it. Rounding it to 2 credits makes it identical to 1K, and then nobody would choose it. There is no correct price for it on a ladder anchored at 1K = 2.

**The ladder**, anchored on 1K = 2 credits: **1K = 2, 2K = 3, 4K = 5.**

Planned against **Rp 18,000 per USD**. Packs slope from Rp 1,750 to a floor of **Rp 1,400 per credit**. Below that floor a 1K generation returns Rp 2,800 against roughly Rp 1,210 of cost, and the rest has to pay for Cloudflare, refunds, and the signup grant.

**The model id floats.** `google/gemini-3.1-flash-image`, not the dated variant. A pinned id eventually retires and the app is simply down; a price change is recoverable — provided you can see it. So `usage.cost` is stored on every generation row, and each tier carries a `costCeilingUsd` that logs loudly when a call exceeds it. A silent margin leak becomes a signal.

**Consequences**

- Every number lives in `src/lib/pricing.ts`. Repricing is one edit.
- Revenue is in IDR and the bill is in USD. A weakening rupiah compresses every margin here directly, and nothing in the app notices. Re-check the planning rate before changing prices.
- The admin overview compares 30 days of revenue against 30 days of image cost. Those windows do not line up — credits bought this month may be spent next — so it shows a trend, not a daily truth.
- Re-measuring is four calls and about $0.37. Do that rather than guessing, and update the table above.
