# Make checkout requests idempotent

Checkout will require an opaque `Idempotency-Key` header. A retry with the same key and the same request data will return the original checkout result; reusing the key with different data will fail.

This contract prevents browser retries and client timeouts from creating duplicate orders, inventory reservations, and Mayar invoices.
