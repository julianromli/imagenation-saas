# Animation plans

Six plans from an `improve-animations` pass over Imagenation. Every one is additive — the audit found no *broken* motion to correct, only motion that was missing.

## All six are implemented

Executed on branch `ui/shadcn-composition-and-motion`, on top of `85b2751` ("Compose the UI from shadcn components"), which is the shadcn refactor that was uncommitted while these plans were written.

The plans were **not** run through executor subagents. Isolated worktrees branch from `HEAD`, which did not contain the refactor, so every plan would have tripped its own drift guard; and 001 must land before 002/004/006 while 002 and 005 share a file, so parallel worktrees would have produced conflicting diffs. They were implemented directly and sequentially instead, at the user's choice.

Everything below is preserved as written, so the reasoning behind each decision stays readable. Line numbers in the plans refer to the pre-`85b2751` working tree and are now stale.

**One plan was wrong and was corrected during execution.** See "Deviations made during execution" in [002](002-animate-generated-image-arrival.md): the `loaded` boolean plus a reset effect painted a stale frame when switching between Recent thumbnails. It ships as a stored `loadedId` compared against `result.id`, which cannot paint stale.

## Plans

| # | Title | Severity | Depends on | Status |
| --- | --- | --- | --- | --- |
| [001](001-extend-motion-vocabulary.md) | Extend the motion vocabulary in `styles.css` | MEDIUM | — | **DONE** |
| [002](002-animate-generated-image-arrival.md) | Give the finished image an arrival, and stop it shifting the layout | MEDIUM | 001 | **DONE** (with deviations) |
| [003](003-bump-header-balance-on-change.md) | Bump the header credit balance when it actually changes | LOW | — | **DONE** |
| [004](004-animate-history-share-disclosure.md) | Animate the share-options disclosure on history cards | MEDIUM | 001 | **DONE** |
| [005](005-animate-reference-thumbnail-entry.md) | Give uploaded reference thumbnails an entrance | LOW | — | **DONE** |
| [006](006-animate-auth-name-field-disclosure.md) | Animate the Name field when switching auth modes | LOW | 001 | **DONE** (was optional) |

## Still outstanding: the feel checks

Every plan's **Mechanical** verification passed — typecheck, lint, 22 tests, production build, and the four new classes confirmed present in the built CSS.

None of the **Feel check** sections have been run. They need a browser, a signed-in account, and a real generation. The highest-value ones, in order:

1. **002** — the `bg-muted` box must already be at final height before the image paints. Check at `16:9` and `9:16`.
2. **006** — sign-in must still submit. If it refuses, the conditional `required` regressed.
3. **006** — spacing above the Email field in sign-in mode must be unchanged. This verifies the `-mb-6`/`pb-6` pair actually cancels FieldGroup's flex gap, which is the one thing in this set that cannot be confirmed from code alone.
4. **004** and **006** — Tab past a collapsed disclosure; focus must skip its contents.
5. **003** — navigate between routes without generating; the balance must not animate.

## Recommended execution order (historical)

**001 first, always.** It is pure CSS and touches no component. It adds `.rise-in-plain` (002), the `.disclosure` pattern (004, 006), and a targeted `prefers-reduced-motion` override that four of the five remaining plans rely on to degrade correctly.

Then, in leverage order:

1. **002** — the highest-leverage change in the set. Also the only one that fixes a real defect rather than adding polish: the generated image currently has no reserved space and shifts the layout as it loads.
2. **004** — the largest visible jump in the app after 002.
3. **003** — one line, immediate payoff.
4. **005** — one line.
5. **006** — optional. See the header of that plan; the recommendation is to ship 001–005, live with them, and only return to this if the auth switch still bothers you.

003 and 005 have no dependency on 001 and can be done at any point. They use `.bump-in`, which already exists and is untouched by 001 — though without 001 they fall back to the blanket 1ms reduced-motion clamp instead of the 120ms fade, which is acceptable for motion that small.

002 and 005 both touch `src/components/image-generator.tsx`, in different places. No conflict, but do them one at a time.

## What this set does not do

Recorded so it does not get re-proposed:

- **No animation on the Generate button's label morph.** It is the single most-repeated action in the product. Motion on the core loop makes the whole app feel slower.
- **No entrance on route or panel load.** `.rise-in-children` exists in `styles.css` for this and stays unused deliberately — a 350ms staggered entrance on every navigation taxes the path people walk most. It is a tool, not a landing page.
- **No stagger on the admin stat cards.** Those are numbers an operator is reading. Data being read should not move for style.
- **No transition on the Recent-strip selection ring.** Tens of interactions a day, and the ring answers "which one am I looking at" — the user wants that instantly.
- **No animation on the Copy → Check icon swap.** The label already changes to "Copied".
- **No sliding thumb on the auth `ToggleGroup`.** Large machinery for a control used twice per user.
- **`.badge-pop` stays unused.** 320ms and a scale to 1.25 is too loud for the header balance, which is the only counter in the app. Plan 003 uses `.bump-in` instead.
- **No exit animation on reference thumbnails.** `src/lib/motion.ts` has the `EXIT_DURATION_MS` / `prefersReducedMotion` helpers for exactly this and they stay unused; a delayed-unmount state machine is not worth it for a 64px tile.

## One thing outside animation scope

Turning the "Public link" switch **off** in `/history` revokes a share token and dead-links a URL the user may already have sent to someone. That is a destructive action confirmed by a single switch flick.

Plan 004 explicitly does not touch it, because the fix is a confirmation step, not motion. Worth raising as a separate product issue.

## After execution

Run `improve-animations reconcile` to re-check these plans against the code, mark completed ones DONE, and refresh any file:line references that have drifted.
