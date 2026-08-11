# 004 — Animate the share-options disclosure on history cards

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`.
- **Depends on**: 001 (needs `.disclosure`)
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: MEDIUM
- **Category**: Missed opportunities (8), Interruptibility (4)
- **Estimated scope**: 1 file (`src/routes/history.tsx`), roughly 15 lines changed

## Problem

Flipping the "Public link" switch on a history card makes the card grow by roughly 90px in a single frame — a second switch row and a "Copy link" button appear from nothing, and the two-column grid reflows around them.

```tsx
/* src/routes/history.tsx:185-214 — current */
          {shareToken ? (
            <>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-sm">
                  Show the prompt
                </span>
                <Switch
                  aria-label="Show the prompt on the shared page"
                  checked={promptVisible}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    updateShare(true, checked === true)
                  }
                />
              </div>
              <Button
                className="min-h-10 rounded-full"
                onClick={copyLink}
                type="button"
                variant="outline"
              >
                {copied ? (
                  <Check aria-hidden="true" data-icon="inline-start" />
                ) : (
                  <Copy aria-hidden="true" data-icon="inline-start" />
                )}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </>
          ) : null}
```

Two things make this worth fixing rather than tolerating:

1. **The change is remote-driven.** `updateShare` (`src/routes/history.tsx:97-115`) awaits a server call before `setShareToken` runs. The user flips a switch, waits an indeterminate moment, and then the card jumps. Nothing connects the action to the result.
2. **It is reversible and re-triggerable.** The switch can be flipped back and forth. A conditional render restarts from nothing every time; a CSS transition retargets from wherever it currently is, so a fast flip-flop stays smooth instead of snapping.

## Target

Keep the content permanently mounted and drive it with the `.disclosure` pattern from plan 001.

```tsx
/* target — src/routes/history.tsx, replacing the block above */
          <div className="disclosure" data-open={Boolean(shareToken)} inert={!shareToken}>
            <div>
              <div className="grid gap-3 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-sm">
                    Show the prompt
                  </span>
                  <Switch
                    aria-label="Show the prompt on the shared page"
                    checked={promptVisible}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      updateShare(true, checked === true)
                    }
                  />
                </div>
                <Button
                  className="min-h-10 rounded-full"
                  onClick={copyLink}
                  type="button"
                  variant="outline"
                >
                  {copied ? (
                    <Check aria-hidden="true" data-icon="inline-start" />
                  ) : (
                    <Copy aria-hidden="true" data-icon="inline-start" />
                  )}
                  {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
            </div>
          </div>
```

Four structural details, each load-bearing:

- **The content is always rendered.** A CSS transition needs a start state and an end state present in the DOM. This is the reason the `{shareToken ? … : null}` goes away.
- **`inert={!shareToken}`** keeps the collapsed Switch and Button out of the tab order and out of the accessibility tree. Without it, a keyboard user tabs into a zero-height, invisible switch. React 19 (this repo runs `react@^19.2.6`) passes `inert` through as a real attribute — no polyfill needed.
- **The nested `<div>` inside `.disclosure`** is required by the pattern: plan 001's `.disclosure > *` rule puts `min-height: 0; overflow: hidden` on it, and that is what clips the content while the row height animates.
- **`pt-3` moves inside.** The parent at line 162 is `grid gap-3`; a permanently-mounted child would keep contributing a 12px gap while collapsed, leaving dead space under the first switch row. Moving the spacing inside the clipped area makes it collapse with the content. See step 3.

Resulting motion: `grid-template-rows: 0fr → 1fr` over `200ms cubic-bezier(0.2, 0, 0, 1)` plus `opacity` over `150ms cubic-bezier(0.23, 1, 0.32, 1)`. Under `prefers-reduced-motion: reduce`, plan 001's override collapses this to a 120ms opacity fade with the height snapping.

## Repo conventions to follow

- This file already uses `Boolean(shareToken)` to coerce the nullable token to a boolean at `src/routes/history.tsx:177`. Reuse that idiom for `data-open`; do not write `!!shareToken`.
- Biome (via `ultracite`) enforces alphabetically sorted JSX props: `className`, `data-open`, `inert`.
- Layout spacing in this file is `gap-*` on a flex or grid parent — there are no `space-y-*` utilities anywhere in `src/`. Keep it that way.
- Exemplar for the surrounding card structure: `src/routes/history.tsx:161-183`, the always-present "Public link" row.

## Steps

1. Open `src/routes/history.tsx`. Confirm line 162 reads `<div className="mt-auto grid gap-3 border-border/70 border-t pt-3">` and that lines 185-214 match the Problem excerpt. If not, STOP and report drift.
2. Replace lines 185-214 (the `{shareToken ? ( … ) : null}` block, inclusive of both braces) with the Target markup.
3. On line 162, change `className="mt-auto grid gap-3 border-border/70 border-t pt-3"` to `className="mt-auto grid border-border/70 border-t pt-3"` — remove **only** `gap-3`. The spacing is now carried by `grid gap-3 pt-3` inside the disclosure, so that the gap collapses along with the content.
4. Leave the "Public link" row (lines 163-183) and everything above it untouched.
5. Verify the JSX nests exactly three levels: `.disclosure` → clipping `<div>` → `grid gap-3 pt-3` content wrapper. Dropping the middle `<div>` breaks the clip and the animation will not work.

## Boundaries

- Do NOT touch any file other than `src/routes/history.tsx`.
- Do NOT apply this pattern to the outer `{generation.status === "succeeded" && generation.imageUrl ? … : null}` block at line 161. That depends on data loaded with the page, never toggles at runtime, and animating it would make every card entrance jitter on load.
- Do NOT animate the `Check` ↔ `Copy` icon swap inside the button. The label already changes to "Copied"; motion adds no information there.
- Do NOT add a confirmation step or change what the switch does. Turning sharing off revokes a live URL, which is arguably a destructive action worth confirming — that is a real product question and it is explicitly **out of scope** for this plan. Raise it separately; do not solve it here.
- Do NOT add a dependency or a motion library.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run typecheck` — must exit 0. If TypeScript rejects `inert`, STOP and report: it means the React types in this tree are older than expected, and the fix is a types question, not an improvisation.
  - `npm run lint` — must exit 0.
  - `npm run build` — must exit 0.
- **Feel check**: run the app, sign in, go to `/history` with at least two succeeded images.
  - Flip "Public link" on. The card must **grow smoothly** over about 200ms; the two rows must fade in as the height opens, not appear at full opacity in a zero-height box.
  - Flip it off. It must close the same way it opened.
  - With the card **collapsed**, press Tab repeatedly through the page. Focus must **skip** the hidden "Show the prompt" switch and the "Copy link" button entirely. This is the `inert` check and the most likely thing to get wrong.
  - With the card collapsed, confirm there is **no dead gap** between the "Public link" row and the bottom edge of the card. If there is, step 3 was missed.
  - Flip the switch rapidly several times. The height must retarget from wherever it is — it must never snap to zero and restart. (This is why the plan uses a transition rather than a keyframe animation.)
  - DevTools → Animations panel → playback **10%**, then open one card. Confirm the height and the opacity finish at roughly the same moment, with opacity slightly ahead.
  - DevTools → Performance → record one open. Layout events during the 200ms are **expected and accepted** here — `grid-template-rows` is a layout property, and plan 001 documents this as a deliberate exception. What must not appear is jank in the other cards in the grid; watch the neighbouring column while one card opens.
  - DevTools → Rendering → **prefers-reduced-motion: reduce**. The card must snap to its new height with a short fade, not animate the height.
- **Done when**: the disclosure opens and closes smoothly, rapid toggling never restarts it, collapsed content is unreachable by keyboard, no dead gap remains when closed, and reduced motion drops the height animation but keeps the fade.
