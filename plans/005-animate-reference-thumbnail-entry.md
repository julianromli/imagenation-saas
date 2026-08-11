# 005 — Give uploaded reference thumbnails an entrance

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`.
- **Depends on**: none (uses the existing `.bump-in`, which plan 001 leaves untouched)
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: LOW
- **Category**: Missed opportunities (8)
- **Estimated scope**: 1 file (`src/components/image-generator.tsx`), 1 line changed

## Problem

Uploading a reference image is a deliberate, asynchronous act: the user picks a file, the "Add" tile shows a spinner while `uploadReferenceImage` runs (inside `addReferences`, `src/components/image-generator.tsx:209-239`), and then a 64px thumbnail appears out of nowhere and shoves the Add tile sideways.

```tsx
/* src/components/image-generator.tsx:290-307 — current */
            <div className="flex flex-wrap gap-2">
              {references.map((reference) => (
                <span className="relative" key={reference.objectKey}>
                  <img
                    alt=""
                    className="size-16 rounded-xl object-cover ring-1 ring-border"
                    src={reference.previewUrl}
                  />
                  <button
                    aria-label="Remove reference image"
                    className="-top-1.5 -right-1.5 absolute inline-flex size-6 items-center justify-center rounded-full bg-foreground text-background transition-transform duration-150 ease-out-quint hover:scale-105 active:scale-95"
                    onClick={() => removeReference(reference.objectKey)}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-3" />
                  </button>
                </span>
              ))}
```

The remove button already has correct press feedback (`hover:scale-105 active:scale-95`, `duration-150 ease-out-quint`). Only the tile's own arrival is missing.

This is deliberately the smallest plan in the set. The multi-file case is the reason it is worth doing at all: the file input is `multiple` (line 327) and `MAX_REFERENCE_IMAGES` tiles can land in one `setReferences` call inside `addReferences`, so several boxes can appear in one frame.

## Target

```tsx
/* target — src/components/image-generator.tsx:292 */
                <span className="relative bump-in" key={reference.objectKey}>
```

One class. Nothing else changes.

`.bump-in` is `opacity: 0 → 1` and `translate: 0 4px → 0` over `140ms cubic-bezier(0.23, 1, 0.32, 1)` with `backwards` fill (`src/styles.css:167-176`). Each `<span>` is keyed by `objectKey` and mounts exactly once, so the animation runs once per thumbnail and never on re-render.

**No stagger.** `.rise-in` supports a `--n` stagger, but its step is 90ms — above the 30–80ms range the audit playbook allows, and at five files it would run 350 + 4×90 = 710ms, well past budget for a list of small squares. `.bump-in` fires all tiles together in 140ms, which is the restrained answer.

## Repo conventions to follow

- Motion classes are appended to the existing Tailwind string. See plan 003, which does the same thing to the header balance span.
- Biome (via `ultracite`) enforces alphabetically sorted JSX props: `className` before `key`.
- Do not reorder or reformat the surrounding JSX; this should be a one-line diff.

## Steps

1. Open `src/components/image-generator.tsx`. Confirm line 292 reads `<span className="relative" key={reference.objectKey}>`. If not, STOP and report drift.
2. Change the className from `"relative"` to `"relative bump-in"`.
3. Change nothing else.

## Boundaries

- Do NOT add an exit animation. `removeReference` (lines 241-251) drops the item from state synchronously and revokes its object URL; animating the exit means delaying the unmount, which needs the `EXIT_DURATION_MS` / `prefersReducedMotion` helpers in `src/lib/motion.ts` and a pending-removal state machine. That machinery exists but is unused, and it is not worth wiring for a 64px tile. If symmetry is wanted later it is a separate plan.
- Do NOT add a stagger, and do NOT use `.rise-in` here. See Target for why.
- Do NOT touch the "Add" tile at lines 308-323 or the remove button at lines 298-305 (verify these before editing; only line 292 changes). The remove button already has correct press feedback.
- Do NOT touch the Recent-strip thumbnails at lines 460-483. Those render on page load, are seen on every visit, and an entrance there would tax the most-walked path in the app.
- Do NOT add a dependency or a new CSS class.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run typecheck` — must exit 0.
  - `npm run lint` — must exit 0.
  - `git diff --stat src/components/image-generator.tsx` — expect 1 insertion, 1 deletion. If this plan is applied after plan 002, expect that plan's changes too; the line touched here must still be a single-line change.
- **Feel check**: run the app, sign in, go to `/`.
  - Add one reference image. The tile must fade and rise ~4px into place over about 140ms.
  - Select **three or more files at once**. All tiles must appear together in one 140ms beat — not in sequence. If they cascade, a stagger was added; remove it.
  - Remove a tile. It must disappear instantly, and the row reflows instantly. That is intentional — do not "fix" it.
  - Type in the prompt textarea after adding a tile. The thumbnails must **not** re-animate on re-render. If they do, the `key` was changed or the class was moved onto an unkeyed element.
  - DevTools → Rendering → **prefers-reduced-motion: reduce**, add a file: a brief fade, no movement.
- **Done when**: tiles animate once on arrival, several files arrive together rather than in sequence, and typing never re-triggers the animation.
