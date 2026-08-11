# 003 — Bump the header credit balance when it actually changes

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`.
- **Depends on**: none (uses the existing `.bump-in`, which plan 001 leaves untouched)
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: LOW
- **Category**: Missed opportunities (8)
- **Estimated scope**: 1 file (`src/components/site-header.tsx`), 1 line changed

## Problem

Spending credits is the one irreversible thing this product does to a user's money, and the number that records it changes in complete silence.

```tsx
/* src/components/site-header.tsx:60-71 — current */
          {signedIn ? (
            <Button
              className="min-h-9 rounded-full"
              render={<Link to="/credits" />}
              variant="outline"
            >
              <Sparkles aria-hidden="true" data-icon="inline-start" />
              <span className="tabular-nums">{balance}</span>
              <span className="text-muted-foreground">
                {balance === 1 ? "credit" : "credits"}
              </span>
            </Button>
          ) : (
```

After a generation succeeds, `src/components/image-generator.tsx:161` calls `await router.invalidate()`, the root loader re-reads the balance, and the digits swap in place. Nothing marks the moment.

`.bump-in` exists in `src/styles.css:174-176` for exactly this. Its comment reads *"A derived value settling on its new number."* It has never been used.

**Frequency constrains the fix.** A user in a working session hits this tens of times a day. The audit playbook says that tier gets removed or drastically reduced motion — so the answer is `.bump-in` (140ms, `opacity` + a 4px rise), **not** `.badge-pop` (320ms, `scale` to 1.25). `.badge-pop` is too loud to see thirty times an afternoon; leave it unused.

## Target

```tsx
/* target — src/components/site-header.tsx, inside the signedIn Button */
              <span className="tabular-nums bump-in" key={balance}>
                {balance}
              </span>
```

That is the whole change. One line becomes three.

The mechanism matters and is the reason this is a one-liner rather than an effect: **`key={balance}`**. React discards and remounts the `<span>` only when the number differs, which restarts the CSS animation. `router.invalidate()` fires on many navigations that leave the balance untouched — a `useEffect`-driven class would replay on all of them. Keying on the value means the bump fires if and only if the value moved.

Resulting motion: `opacity: 0 → 1` and `translate: 0 4px → 0` over `140ms cubic-bezier(0.23, 1, 0.32, 1)`, with `backwards` fill. Under `prefers-reduced-motion: reduce`, plan 001's override reduces it to a 120ms fade with no movement; without plan 001 the existing blanket clamp reduces it to 1ms, which is also acceptable for a motion this small.

## Repo conventions to follow

- Motion classes are plain class names appended to the Tailwind string, not applied through a wrapper component. There is no existing usage to copy — this plan and plan 005 are the first two.
- `tabular-nums` must stay on the span. Without it the digits are proportionally spaced and the pill visibly re-widths as the number changes, which would undo the point of the fix.
- Biome (via `ultracite`) enforces alphabetically sorted JSX props. `className` comes before `key`.
- Do not introduce `useState`, `useEffect`, or `useRef` here. `SiteHeader` is currently a single `useState` for the mobile sheet (`src/components/site-header.tsx:27`) and should stay that simple.

## Steps

1. Open `src/components/site-header.tsx`. Confirm line 67 reads `<span className="tabular-nums">{balance}</span>`. If not, STOP and report drift.
2. Replace that single line with the three-line Target version: add `bump-in` to the className and add `key={balance}`.
3. Change nothing else.

## Boundaries

- Do NOT touch any file other than `src/components/site-header.tsx`.
- Do NOT apply `.badge-pop` here, or anywhere. It is 320ms and scales to 1.25 — too loud for an element seen tens of times a day. It stays unused.
- Do NOT animate the `{balance === 1 ? "credit" : "credits"}` span next to it. The word changes only between 1 and any other number; animating it would fire on a change the user does not care about.
- Do NOT apply the same treatment to the other balance readouts — `src/routes/credits.tsx:60` and `src/routes/account/index.tsx:59`. Those are static page content the user navigated to deliberately, not a value changing under their eyes.
- Do NOT add a dependency or a new CSS class.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run typecheck` — must exit 0.
  - `npm run lint` — must exit 0.
  - `grep -n 'key={balance}' src/components/site-header.tsx` — expect exactly one match.
- **Feel check**: run the app, sign in with a balance above the cost of one image, and generate.
  - When the generation completes, the header number must rise ~4px into place and fade, once, over about 140ms. It should read as a settle, not a pop.
  - Navigate between `/`, `/history` and `/credits` **without** generating. Each navigation invalidates the root loader. The number must **not** animate on any of them. This is the check that separates a correct implementation from a `useEffect` one.
  - DevTools → Animations panel → playback **10%**. Confirm opacity + a small translate, no scale.
  - Confirm the pill does not change width as the digits change (this verifies `tabular-nums` survived).
  - DevTools → Rendering → **prefers-reduced-motion: reduce**, generate again: a short fade, no movement.
- **Done when**: the balance animates on change and only on change, the pill width is stable, and navigation alone never triggers it.
