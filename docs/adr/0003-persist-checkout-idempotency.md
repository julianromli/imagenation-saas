# Persist checkout idempotency state

Checkout idempotency will use a dedicated database table. The record will contain the request fingerprint, processing state, related order, and an encrypted copy of the original response so concurrent and later retries remain safe across application instances.
