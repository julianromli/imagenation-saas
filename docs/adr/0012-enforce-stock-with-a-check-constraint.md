# Enforce stock with a check constraint inside a batch

D1 has no interactive transaction, so checkout cannot read stock, decide in JavaScript, and write inside one transaction. Checkout will instead run as a single `db.batch()`, and the stock guard will move from a `WHERE available_stock >= ?` clause into a `CHECK (available_stock >= 0)` constraint on the product row. A statement that would oversell violates the constraint, the statement fails, and D1 rolls back the whole batch.

A Durable Object that serializes all checkouts was considered and rejected. It gives the same protection, but it holds that protection in code discipline: every write path, including future ones, must remember to go through the object. A column constraint holds the protection in the database, where no write path can avoid it.

**Consequences**

- The most expensive invariant, never oversell, is enforced for every write path, including paths that do not exist yet.
- A constraint violation does not name the product that ran out. Checkout must query again after a failure to build a readable error message.
- Product price and status are read before the batch, so a price change during checkout is not detected. This race is accepted: prices in a small store rarely change while a checkout is in flight.
- The same mechanism carries checkout idempotency. See ADR-0003.
