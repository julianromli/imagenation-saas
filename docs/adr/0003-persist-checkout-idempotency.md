# Persist checkout idempotency state

Rewritten after ADR-0012. The original decision was never built: no idempotency table and no `Idempotency-Key` handling existed in the code.

Checkout idempotency will use a dedicated `checkout_request` table whose primary key is the idempotency key, together with a fingerprint of the request and the resulting order. A repeat of the same key with the same request data returns the original order; the same key with different data is rejected. The record is inserted as the first statement of the checkout batch, so a duplicate key violates the primary key, the statement fails, and D1 rolls back the whole batch. Duplicate protection therefore uses the same mechanism as the stock guard, with a different constraint.

The encrypted copy of the original response, required by the original version of this decision, is dropped. The response can be rebuilt from the stored order, and encrypting it adds key management that a boilerplate should not carry.

**Consequences**

- A replay cannot return the original response verbatim. That response carried an order access token, and only its hash is stored, so a replay issues a fresh token for the same order. Storing the token in plain text was rejected: `orders.access_token_hash` exists precisely so that a database read does not hand out order access. Reaching this path already requires the original idempotency key.
- A retried checkout cannot create a second order, a second reservation, or a second Mayar invoice.
- The idempotency record shares the lifetime of the batch, so there is no window where the key is recorded but the order is not.
