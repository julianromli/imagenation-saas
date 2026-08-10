# Keep the credit ledger in D1, not in Mayar's wallet

Mayar has a credit wallet API — `credit add`, `credit spend`, `credit balance`, keyed on a customer and a product. Imagenation will not use it. The balance lives in D1, and Mayar is used only to sell top-ups as invoices.

Three reasons decided this.

Mayar allows 50 requests per minute for each API key. A remote wallet puts a call on the hot path of every generate, so that shared account-wide ceiling would become the product's ceiling.

A remote wallet cannot be spent atomically with the local write that records what the credits bought. A crash between "spend" and "generation row written" would take a user's money and leave nothing pointing at it. In D1 both happen in one batch, or neither happens.

The balance is a number the product reads on every page load. A network call for it is latency, and a second thing that can be down.

The ledger is `credit_entry`, append-only: a row is never updated or deleted, so the balance can always be rebuilt by summing `delta`. `credit_account.balance` is a cache of that sum, written in the same batch, and carries `CHECK (balance >= 0)`.

The CHECK is the overspend guard, not application code. D1 has no interactive transaction, so a spend cannot read the balance, decide in JavaScript, and write inside one transaction — two concurrent spends would read the same balance and both succeed. A constraint holds the guard in the database, where no write path can avoid it, including write paths that do not exist yet. This is the same technique the parent ecommerce template used for stock.

Every spend batch begins by inserting the account row `ON CONFLICT DO NOTHING`. Without it a decrement against a missing row would match nothing and succeed silently, and the CHECK can only guard a row that exists.

A unique index on `(ref_type, ref_id, reason)` makes each entry exactly-once. That single constraint is what makes a replayed Mayar webhook, a double refund, and a repeated signup grant all harmless.

**Consequences**

- Two concurrent spends against a balance that only covers one: at most one succeeds, and the loser gets a constraint violation the application translates into "not enough credits".
- The signup grant is written lazily, on the first balance read, with `ref_type = 'signup'` and `ref_id = <user id>`. The unique index enforces "once", so no auth hook is needed.
- Manual adjustments from the admin are normal ledger entries carrying a reason, never an `UPDATE` on the balance. Every support decision stays readable afterwards.
- `idr_value` is recorded on purchases and grants, and left null on spends. A spend is denominated in credits, and repricing must not rewrite what an old spend cost.
- Rebuilding a balance from the ledger is a `SUM`. Reconciling the cache against it is the first thing to try if a balance is ever disputed.
