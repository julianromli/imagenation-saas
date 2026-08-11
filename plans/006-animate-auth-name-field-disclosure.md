# 006 — Animate the Name field when switching auth modes

- **Status**: DONE — implemented directly on branch `ui/shadcn-composition-and-motion`, on top of `85b2751`. (Was optional; shipped at the user's request.)
- **Depends on**: 001 (needs `.disclosure`)
- **Commit**: `b8b95d1` **plus an uncommitted working tree** (15 modified files). Line numbers below refer to the working tree, not to the commit. Verify each excerpt before editing.
- **Severity**: LOW
- **Category**: Missed opportunities (8)
- **Estimated scope**: 1 file (`src/routes/auth.tsx`), roughly 12 lines changed

## Is this worth doing?

Read this first; the honest answer may be no.

A user sees this moment **once or twice in their entire life with the product** — the sign-up/sign-in switch on `/auth`. The jump it removes lasts one frame.

Against that, the fix costs three nested wrapper divs, a static negative margin to keep the form's spacing correct, and a conditional `required` attribute to avoid breaking sign-in submission. It is the only plan in this set with a correctness trap in it (step 4).

The recommendation is to ship plans 001–005 first, live with them, and only pick this one up if the auth switch still bothers you. It is written out in full because it was requested, not because it earns its place.

## Problem

Switching the toggle from "Sign in" to "Create account" inserts a Name field at the top of the form and shoves the Email field, the Password field, and the submit button down by roughly 76px in one frame.

```tsx
/* src/routes/auth.tsx:131-138 — current */
      <form className="mt-8" onSubmit={submit}>
        <FieldGroup>
          {mode === "sign-up" ? (
            <Field>
              <FieldLabel htmlFor="auth-name">Name</FieldLabel>
              <Input autoComplete="name" id="auth-name" name="name" required />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="auth-email">Email address</FieldLabel>
```

Note what the fix has to be: **fading the field in would not help.** The jump is the reflow of everything below it. Only animating the height removes it.

## Target

```tsx
/* target — src/routes/auth.tsx, replacing lines 133-138 */
          <div
            className="-mb-6 disclosure"
            data-open={mode === "sign-up"}
            inert={mode !== "sign-up"}
          >
            <div>
              <div className="pb-6">
                <Field>
                  <FieldLabel htmlFor="auth-name">Name</FieldLabel>
                  <Input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    required={mode === "sign-up"}
                  />
                </Field>
              </div>
            </div>
          </div>
```

Four details, each load-bearing. Removing any one of them breaks something.

**1. The content stays mounted.** A CSS transition needs both states in the DOM. This is why the `{mode === "sign-up" ? … : null}` goes away.

**2. `-mb-6` outside plus `pb-6` inside.** `FieldGroup` is `flex w-full flex-col gap-6` (`src/components/ui/field.tsx:40-50`). A flex gap applies to a zero-height item just the same as a tall one, so a permanently-mounted wrapper would leave 24px of dead space above the Email field in sign-in mode. The static `-mb-6` cancels that gap; the `pb-6` inside the clipped area re-creates it, and collapses with the content. Both margins are static — nothing animates a margin.

**3. `inert={mode !== "sign-up"}`** keeps the collapsed Name input out of the tab order and the accessibility tree. React 19 (this repo runs `react@^19.2.6`) passes `inert` through as a real attribute.

**4. `required={mode === "sign-up"}` — this is the trap.** `inert` does **not** exclude a field from form submission or from constraint validation. Leaving `required` unconditional means an always-mounted, always-empty Name input silently blocks the sign-in form from ever submitting, with a validation bubble pointing at an invisible element. Do not skip this.

The submit handler already reads `String(form.get("name") ?? "")` (`src/routes/auth.tsx:66`) and only passes it on the sign-up branch, so an empty `name` arriving in the sign-in FormData is already harmless. No handler change is needed.

Resulting motion: `grid-template-rows: 0fr → 1fr` over `200ms cubic-bezier(0.2, 0, 0, 1)` plus `opacity` over `150ms cubic-bezier(0.23, 1, 0.32, 1)`. Under `prefers-reduced-motion: reduce`, plan 001's override collapses it to a 120ms fade with the height snapping.

## Repo conventions to follow

- Biome (via `ultracite`) enforces alphabetically sorted JSX props: `className`, `data-open`, `inert`.
- Form layout in this repo is `FieldGroup` → `Field` → `FieldLabel` + control. Do not replace the `Field` with raw markup; the wrapper divs go **around** it.
- Exemplar for the same disclosure pattern in a component: plan 004's change to `src/routes/history.tsx`. Apply that one first if you want a working reference in the tree.
- Spacing is `gap-*`, never `space-y-*`. There are no `space-y-*` utilities anywhere in `src/`.

## Steps

1. Open `src/routes/auth.tsx`. Confirm lines 131-138 match the Problem excerpt exactly. If not, STOP and report drift.
2. Replace lines 133-138 (the `{mode === "sign-up" ? ( … ) : null}` block, inclusive of both braces) with the Target markup.
3. Confirm the nesting is exactly: `.disclosure` wrapper → clipping `<div>` → `<div className="pb-6">` → `<Field>`. Plan 001's `.disclosure > *` rule applies `min-height: 0; overflow: hidden` to the second div; dropping it breaks the clip and the animation will not run.
4. On the `Input`, change `required` to `required={mode === "sign-up"}`. **Do not skip this** — see Target detail 4.
5. Change nothing else in the file.

## Boundaries

- Do NOT touch any file other than `src/routes/auth.tsx`.
- Do NOT animate the heading or the subtitle at `src/routes/auth.tsx:92-99`. They swap text in place with no reflow; a crossfade there would double-expose two strings and read worse than the instant swap.
- Do NOT add a sliding indicator to the `ToggleGroup` at lines 101-129. A sliding thumb needs either layout measurement or an absolutely-positioned indicator, which is a large amount of machinery for a control used twice per user. The current recolour is correct.
- Do NOT change the `autoComplete`, `id`, or `name` attributes on the Input. Password managers key off them.
- Do NOT change `submit()` or the `FormData` handling.
- Do NOT add a dependency or a new CSS class.
- If a step does not match the code you find, STOP and report instead of improvising.

## Verification

- **Mechanical**:
  - `npm run typecheck` — must exit 0.
  - `npm run lint` — must exit 0.
  - `npm run build` — must exit 0.
- **Feel check**: run the app and go to `/auth`.
  - **Sign in must still work.** This is the first thing to test, before looking at any motion. Switch to "Sign in", fill email and password, submit. If the form refuses to submit or a validation bubble points at nothing, step 4 was skipped.
  - Switch to "Create account". The Name field must **grow into place** over about 200ms while the fields below slide down smoothly — not jump.
  - Switch back to "Sign in". It must close the same way.
  - In "Sign in" mode, confirm the vertical spacing above the Email field is **identical** to what it was before this change. If there is an extra ~24px gap, the `-mb-6` / `pb-6` pair was mis-applied.
  - In "Sign in" mode, press Tab from the toggle. Focus must land on the **Email** field, skipping the hidden Name input entirely.
  - Toggle back and forth rapidly. The height must retarget from wherever it is, never snap to zero and restart.
  - Open a password manager (1Password, or the browser's built-in) on the sign-up form and confirm it still offers to fill Name. This verifies the attributes survived.
  - DevTools → Animations panel → playback **10%**. Confirm the height and opacity finish together, opacity slightly ahead.
  - DevTools → Rendering → **prefers-reduced-motion: reduce**. The field must snap into place with a short fade, not animate its height.
- **Done when**: sign-in submits normally, the Name field grows and collapses smoothly, spacing in sign-in mode is unchanged from before, the collapsed input is unreachable by keyboard, and reduced motion drops the height animation.
