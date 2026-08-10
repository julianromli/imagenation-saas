# Make paid requests idempotent

Rewritten when the ecommerce template became Imagenation. The original decision covered checkout; the mechanism is unchanged, and it now covers generating an image, which is the request that costs a user money.

Any request that spends credits will require an opaque `Idempotency-Key` header. A retry with the same key returns the original result rather than starting a second attempt; a second attempt would take the credits a second time.

This contract prevents browser retries, client timeouts, and impatient double-clicks from charging twice. Disabling the button was rejected as the primary guard: it protects against one user's finger, not against a retry the network performed on their behalf.

**Consequences**

- The browser mints the key before it sends the request and stores it, so a tab that reloads mid-generation can replay the same key and rejoin its own attempt instead of paying again. See ADR-0017.
- Buying credits does not use a header key. It reuses a pending Mayar invoice for the same pack instead, because Mayar answers a duplicate invoice create with `429` and a one-minute wait. See ADR-0019.
