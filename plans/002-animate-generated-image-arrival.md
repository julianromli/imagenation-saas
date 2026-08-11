# 002 — Give the finished image an arrival, and stop it shifting the layout

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`.
- **Depends on**: 001 (needs `.rise-in-plain`)
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: MEDIUM
- **Category**: Missed opportunities (8), Performance (5)
- **Estimated scope**: 1 file (`src/components/image-generator.tsx`), roughly 20 lines changed

## Problem

This is the payoff moment of the whole product. A user writes a prompt, spends credits, and waits 10–60 seconds. Then the image arrives — with no arrival at all.

```tsx
/* src/components/image-generator.tsx:553-559 — current */
  return (
    <figure className="flex flex-1 flex-col gap-3">
      <img
        alt={result.prompt.slice(0, 120)}
        className="w-full rounded-3xl bg-muted object-contain ring-1 ring-border"
        src={result.imageUrl}
      />
```

Two separate defects, and the second is the bigger one.

**1. No entrance.** The `<figure>` replaces the pending `<Empty>` state instantly. After a minute of waiting, the thing the user paid for teleports in. This is the one place in the app where the delight budget is clearly affordable and it is spent nowhere.

**2. The image has no reserved space, so it shifts the layout as it loads.** The `<img>` carries no `width`/`height` attributes and no `aspect-ratio`. Before the bytes arrive its box has zero intrinsic height; as it decodes, the box snaps open to full height and shoves the `<figcaption>` — and on narrow screens the Recent strip below it — down the page.

This matters for the ordering of the fix: a fade added on mount would run over a collapsed, empty box and finish *before* the image paints. The animation would be theatre and the jump would remain. Space must be reserved first, then the image faded in on load.

The aspect ratio is already known. `GenerationView.aspectRatio` (`src/lib/generation.functions.ts:16`) is a string from `ASPECT_RATIOS` (`src/lib/pricing.ts:87-103`) — `"1:1"`, `"16:9"`, `"21:9"` and so on. It is already rendered as text at `src/components/image-generator.tsx:563`.

## Target

```tsx
/* target — src/components/image-generator.tsx, the final return of ResultPane */
  return (
    <figure className="flex flex-1 flex-col gap-3">
      <img
        alt={result.prompt.slice(0, 120)}
        className={cn(
          "w-full rounded-3xl bg-muted object-contain ring-1 ring-border",
          loaded && "rise-in-plain"
        )}
        key={result.id}
        onLoad={() => setLoaded(true)}
        src={result.imageUrl}
        style={{ aspectRatio: result.aspectRatio.replace(":", " / ") }}
      />
```

with this state added at the top of `ResultPane`:

```tsx
  // The entrance plays on load, not on mount. The image is fetched cold, so
  // animating on mount would run the whole 350ms over an empty box and the
  // image would still pop in at the end.
  const [loaded, setLoaded] = useState(false);
```

and this effect to re-arm it for each new image:

```tsx
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-arms per image, not per render.
  useEffect(() => {
    setLoaded(false);
  }, [result?.id]);
```

Resulting behaviour, in order:

1. `result` is set. The `<figure>` mounts. The `<img>` box already occupies its final height because `aspect-ratio` is set, showing the `bg-muted` placeholder. Nothing below it will move again.
2. The bytes arrive. `onLoad` fires, `loaded` flips, the `rise-in-plain` class lands and the image plays `opacity: 0 → 1` and `translate: 0 8px → 0` over `350ms cubic-bezier(0.23, 1, 0.32, 1)`.
3. Under `prefers-reduced-motion: reduce`, plan 001's override turns that into a 120ms fade with no movement.

`key={result.id}` makes React remount the `<img>` when the user clicks a different thumbnail in the Recent strip (`src/components/image-generator.tsx:460-483`), so each selection re-runs the entrance instead of silently swapping `src`.

## Deviations made during execution

Two changes to the Target above. What shipped differs from what is written; the shipped version is correct.

**1. `loadedId` replaces `loaded` + a reset effect.** The plan specified a boolean plus a `useEffect` keyed on `result?.id`. That is wrong. Effects run after paint, so on the render where the user switches to a different Recent thumbnail, `loaded` is still `true` from the *previous* image — one frame paints with `rise-in-plain` applied, starting a 350ms animation over an unloaded box, which the effect then cancels. What shipped stores the id instead:

```tsx
const [loadedId, setLoadedId] = useState<string | null>(null);
// …
className={cn(
  "w-full rounded-3xl bg-muted object-contain ring-1 ring-border",
  loadedId === result.id && "rise-in-plain"
)}
onLoad={() => setLoadedId(result.id)}
```

`loadedId === result.id` is false on the *same* render that switches image, so no stale frame is ever painted. This also removes the `useEffect` and its `biome-ignore` entirely.

**2. A `biome-ignore` was needed for `onLoad`.** Biome's `lint/a11y/noNoninteractiveElementInteractions` flags any event handler on an `<img>`. That is a false positive here — `onLoad` is a resource lifecycle event, not a user interaction. A single suppression sits above the element:

```tsx
{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: onLoad is a resource event, not a user interaction. */}
```

## Repo conventions to follow

- `cn()` from `@/lib/utils` is the conditional-className helper. It is already imported at `src/components/image-generator.tsx:23` and used at line 463. Do not build className strings with template literals or ternaries.
- `useState`/`useEffect` are already imported at line 3 (`import { useCallback, useEffect, useRef, useState } from "react";`). No import change needed.
- Exemplar for conditional classes: `src/components/image-generator.tsx:462-466`, the Recent-strip thumbnail button.
- Biome (via `ultracite`) enforces alphabetically sorted JSX props in this repo — note that every existing element has its props in alphabetical order. Keep `alt`, `className`, `key`, `onLoad`, `src`, `style` in that order.
- 350ms is above the 300ms UI budget in the audit playbook. That is deliberate and correct here: this is the rare, high-emotion arrival tier, not a dropdown. Do not shorten it.

## Steps

1. Open `src/components/image-generator.tsx`. Find `function ResultPane({` at line 492. Confirm its body currently begins with `if (pending) {` at line 501. If not, STOP and report drift.
2. Insert the `loaded` state and the re-arming effect from Target immediately after the destructured props block closes (after the line `}: {` … `tierSeconds: number;` … `}) {`) and before the `if (pending) {` guard.
3. Find the final `return (` of `ResultPane` at line 553 and its `<img>` at lines 555-559. Replace that `<img>` with the Target version: add `className` wrapped in `cn(...)` with `loaded && "rise-in-plain"`, add `key={result.id}`, add `onLoad={() => setLoaded(true)}`, add the `style` prop with `aspectRatio`.
4. Leave the `<figure>`, `<figcaption>` and everything else in that return untouched.
5. Do not add the entrance to the three `<Empty>` branches above it (lines 501-551). Those are placeholder states, not arrivals.

## Boundaries

- Do NOT touch any file other than `src/components/image-generator.tsx`.
- Do NOT animate the `<figure>` — only the `<img>`. Animating the figure would also move the caption, which is already in place and should not slide.
- Do NOT use `.rise-in`. It animates `filter: blur(2px)`, which is why plan 001 adds `.rise-in-plain` for exactly this case.
- Do NOT add `aspect-ratio` or entrance classes to the other two `<img>` elements in this file (the reference thumbnails at line 293 and the Recent-strip thumbnails at line 471). Those are fixed-size squares and are covered by plan 005 / deliberately excluded.
- Do NOT add a dependency, a motion library, or a new CSS class.
- If `result.aspectRatio` is ever empty or malformed the `style` value becomes invalid and the browser ignores it, falling back to today's behaviour. That is an acceptable failure mode — do NOT add validation or a fallback ratio.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run typecheck` — must exit 0.
  - `npm run lint` — must exit 0. If Biome complains about the `useEffect` dependency array, keep the `biome-ignore` comment from Target; do not add `result` to the deps (that would re-arm on every loader refresh).
  - `npm run build` — must exit 0.
- **Feel check**: run the app, sign in, generate an image.
  - Before the image paints, the grey `bg-muted` box must already be at its **final height**. Nothing below it may move when the image appears. Check at both `16:9` and `9:16` — the two ratios shift the layout most.
  - The image fades **and rises 8px**, it does not just appear.
  - DevTools → Animations panel → set playback speed to **10%**. Confirm the motion is opacity + translate only, and that no blur is involved.
  - DevTools → Performance → record the arrival. Confirm no layout thrash during the 350ms: you should see compositing, not repeated Layout events.
  - Click between thumbnails in the Recent strip. Each selection must replay the entrance. Clicking rapidly must not leave an image stuck at `opacity: 0`.
  - DevTools → Rendering → **prefers-reduced-motion: reduce**. Generate again: the image must still fade (about 120ms) but must **not** translate.
- **Done when**: no layout shift on image load at any aspect ratio, the entrance plays on load rather than on mount, thumbnail switching replays it, and reduced motion degrades to a fade.
