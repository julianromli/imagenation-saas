# 001 — Extend the motion vocabulary in styles.css

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`.
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: MEDIUM
- **Category**: Cohesion & tokens (7), Accessibility (6)
- **Estimated scope**: 1 file (`src/styles.css`), roughly 45 lines added, 0 removed

## Problem

Three things are wrong with the motion layer, and all of them block the plans that follow.

**1. The existing vocabulary is dead code.**

`src/styles.css:141-188` defines four motion classes inside `@layer components`:

```css
/* src/styles.css:141-188 — current */
@layer components {
  /* First-run entrance. `backwards` fill holds the from-state during the
     delay, so the resting state stays authoritative if the animation
     never runs. Stagger by setting --n on each child. */
  @keyframes rise-in {
    from {
      opacity: 0;
      translate: 0 8px;
      filter: blur(2px);
    }
  }

  .rise-in {
    animation: rise-in 350ms var(--curve-out-quint) backwards;
    animation-delay: calc(var(--n, 0) * 90ms);
  }

  .rise-in-children > * {
    animation: rise-in 350ms var(--curve-out-quint) backwards;
  }
  .rise-in-children > *:nth-child(2) { animation-delay: 90ms; }
  .rise-in-children > *:nth-child(3) { animation-delay: 180ms; }
  .rise-in-children > *:nth-child(4) { animation-delay: 270ms; }
  .rise-in-children > *:nth-child(n + 5) { animation-delay: 360ms; }

  /* A derived value settling on its new number. */
  @keyframes bump-in {
    from {
      opacity: 0;
      translate: 0 4px;
    }
  }

  .bump-in {
    animation: bump-in 140ms var(--curve-out-quint) backwards;
  }

  /* One-shot acknowledgement that a counter changed. */
  @keyframes badge-pop {
    0% { scale: 1; }
    35% { scale: 1.25; }
    100% { scale: 1; }
  }

  .badge-pop {
    animation: badge-pop 320ms var(--curve-out-quint);
  }
}
```

Verify with:

```bash
grep -rn "rise-in\|bump-in\|badge-pop" src --include="*.tsx"
```

This returns **no matches**. Someone wrote and documented this vocabulary and never wired it up.

**2. `rise-in` animates `filter: blur(2px)`.**

That is fine over small text. Plan 002 needs the same entrance over a full-width generated image, which can be several megapixels. Animating a filter over an element that large forces a repaint of a large surface each frame, and is worst in Safari. A blur-free variant is needed.

**3. Reduced motion is off, not gentle.**

```css
/* src/styles.css:194-203 — current */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-delay: 0s;
    animation-duration: 1ms;
    animation-iteration-count: 1;
    transition-delay: 0s;
    transition-duration: 1ms;
  }
}
```

The comment above this block documents *why it is `1ms` rather than `none`* — so `transitionend` listeners inside Base UI popups still fire. That reasoning is sound and this plan keeps it.

What the comment does not settle is the blanket scope. Once plans 002 and 004 land, the two motions whose entire job is to *prevent a jarring change* will be clamped to 1ms for reduced-motion users, which hands those users exactly the jarring change the plans exist to remove. The correct behaviour is: drop the movement, keep a short fade.

## Target

Three additions to `src/styles.css`. No deletions, no changes to `@theme inline`, no changes to the `:root` curve tokens.

**A. A blur-free entrance, added inside the existing `@layer components` block:**

```css
/* target — add after the .rise-in-children rules, before the bump-in comment */

  /* Same entrance as .rise-in without the blur. For large surfaces (images,
     full panels) where animating a filter would repaint too much area. */
  @keyframes rise-in-plain {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }

  .rise-in-plain {
    animation: rise-in-plain 350ms var(--curve-out-quint) backwards;
  }
```

**B. A disclosure pattern, added at the end of the same `@layer components` block:**

```css
/* target — add after the .badge-pop rule, still inside @layer components */

  /* Expanding disclosure. The child is clipped, so the row height carries the
     reveal. Mark up as:
       <div class="disclosure" data-open={bool} inert={!bool}>
         <div>…content…</div>
       </div>
     The content stays mounted in both states — a transition needs two states
     to interpolate between. `inert` keeps the closed content out of the tab
     order and the accessibility tree.

     This animates grid-template-rows, which is a layout property. That is a
     deliberate exception to the transform/opacity rule: it runs for 200ms, on
     user action, on one element at a time. Do not reach for it inside a list
     that expands many rows at once. */
  .disclosure {
    display: grid;
    grid-template-rows: 0fr;
    opacity: 0;
    transition:
      grid-template-rows 200ms var(--curve-out-strong),
      opacity 150ms var(--curve-out-quint);
  }

  .disclosure > * {
    min-height: 0;
    overflow: hidden;
  }

  .disclosure[data-open="true"] {
    grid-template-rows: 1fr;
    opacity: 1;
  }

  /* A fade with no movement. Used by the reduced-motion block below. */
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }
```

`--curve-out-strong` is `cubic-bezier(0.2, 0, 0, 1)`, already defined at `src/styles.css:57`. It is the right curve for a size change: it leaves fast and settles flat.

**C. A targeted reduced-motion opt-back-in, appended after the existing block:**

```css
/* target — append at the very end of src/styles.css, after the existing
   prefers-reduced-motion block. Unlayered, same as that block. */

/* The blanket clamp above is correct as a default, but three motions exist
   specifically to prevent a jarring change. For those, drop the movement and
   keep a short fade rather than removing the bridge entirely. Class selectors
   outrank the `*` above, so these win regardless of source order. */
@media (prefers-reduced-motion: reduce) {
  .rise-in,
  .rise-in-plain,
  .bump-in {
    animation-duration: 120ms;
    animation-name: fade-in;
  }

  .disclosure {
    transition-duration: 120ms;
    transition-property: opacity;
  }
}
```

Note the mechanism: overriding `animation-name` to `fade-in` reuses the rest of each shorthand (timing function, `backwards` fill), so the element still fades but no longer translates. Overriding `transition-property` on `.disclosure` makes `grid-template-rows` snap while opacity still fades.

## Repo conventions to follow

- Motion curves live in `:root` at `src/styles.css:54-57`, deliberately outside `@theme inline` so hand-written CSS can read them. The comment there explains why. Use `var(--curve-out-quint)` and `var(--curve-out-strong)` — do **not** write raw cubic-beziers, and do **not** add new curve tokens.
- Motion classes live in `@layer components` at `src/styles.css:141-188`. Add there, in the same style: a `@keyframes` block, then the class, with a comment saying what the class is *for*.
- Exemplar to imitate: the `.bump-in` rule at `src/styles.css:174-176`, including its explanatory comment.
- Indentation in this file is 2 spaces inside `@layer components`, 4 spaces inside `:root` and `@theme inline`. Match the surrounding block.

## Steps

1. Open `src/styles.css`. Confirm the `@layer components` block starts at line 141, its closing `}` is at line 188, and the `prefers-reduced-motion` block starts at line 194. If either is materially different, STOP and report drift.
2. Inside `@layer components`, after the `.rise-in-children > *:nth-child(n + 5)` rule and before the `/* A derived value settling… */` comment, insert block **A** from Target verbatim.
3. Inside the same `@layer components` block, after the `.badge-pop` rule and before the closing `}`, insert block **B** from Target verbatim.
4. At the end of the file, after the closing `}` of the existing `prefers-reduced-motion` block, insert block **C** from Target verbatim.
5. Do not modify anything else in the file.

## Boundaries

- Do NOT touch any file other than `src/styles.css`.
- Do NOT modify the existing `.rise-in`, `.rise-in-children`, `.bump-in`, or `.badge-pop` rules. Plans 002–005 depend on `.rise-in-plain` and `.bump-in` as specified here.
- Do NOT delete the unused `.rise-in-children` and `.badge-pop` rules. They stay unused after every plan in this set lands; whether to remove them is a separate decision for the repo owner, not part of this plan.
- Do NOT change the existing blanket `prefers-reduced-motion` block. Add the new one after it.
- Do NOT add curve tokens, Tailwind theme entries, or dependencies.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run build` — must exit 0. Tailwind v4 does not tree-shake hand-written CSS inside `@layer components`, so all four new selectors must survive.
  - `grep -c "rise-in-plain\|disclosure\|fade-in" src/styles.css` — expect at least 7 matches.
  - `npm run lint` — must report no errors. (Biome is configured to ignore vendored skill files only; `src/styles.css` is checked.)
- **Feel check**: nothing renders differently yet — this plan adds vocabulary and wires up no component. The visible checks belong to plans 002–006. The one thing to confirm now:
  - Open DevTools → Rendering → set **Emulate CSS media feature prefers-reduced-motion** to `reduce`, then re-run `npm run build` output in the browser and confirm no console warnings about unknown properties.
- **Done when**: `src/styles.css` contains `.rise-in-plain`, `.disclosure`, `.disclosure > *`, `.disclosure[data-open="true"]`, `@keyframes fade-in`, and a second `@media (prefers-reduced-motion: reduce)` block naming those classes; the build passes; no other file changed (`git diff --name-only` shows only `src/styles.css` beyond the pre-existing 15 modified files).
