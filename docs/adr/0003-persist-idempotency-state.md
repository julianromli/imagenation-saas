# Persist idempotency state

Rewritten when the ecommerce template became Imagenation. The table changed name and subject; the mechanism did not.

Idempotency will use a dedicated `generation_request` table whose primary key is the idempotency key, together with a fingerprint of the request and the resulting generation. The record is inserted as one statement of the generate batch, so a duplicate key violates the primary key, the statement fails, and D1 rolls back the whole batch — including the credit spend. Duplicate protection therefore uses the same mechanism as the balance guard, with a different constraint. See ADR-0016.

**Consequences**

- A retried generate cannot take the credits twice, cannot write a second job row, and cannot call the model twice.
- The idempotency record shares the lifetime of the batch, so there is no window where the key is recorded but the charge is not, or the reverse.
- A replay is answered by reading the original generation back and returning it. If that generation is still running, the caller rejoins it.
- The fingerprint is stored but not enforced. Reusing one key for a different prompt returns the first image rather than an error, which is the safer failure for a key the browser generated per attempt.
