/**
 * Motion helpers for animations that JavaScript has to sequence.
 *
 * CSS-only motion is handled by the unlayered `prefers-reduced-motion` block
 * in styles.css. This helper is for the cases CSS cannot reach: work that is
 * delayed in JavaScript so an exit animation can play before the element
 * leaves the tree. Under reduced motion that delay must not happen at all.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Duration of a list-item exit, in milliseconds. Matches `duration-150`. */
export const EXIT_DURATION_MS = 150;
