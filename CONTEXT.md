# Domain context

One term for each idea. Never call a credit a "token": `input_references` and
`usage.total_tokens` already mean something else in this codebase, and that
collision is expensive to unpick later.

## credit

The unit a person spends to make an image. Credits have no expiry and no cash
value on their own. What one image costs in credits depends on its resolution,
and nothing else.

## credit ledger

The append-only record of every credit that ever moved, and why. A row is never
updated or deleted, so a balance can always be rebuilt by summing it. The
balance held against an account is a cache of that sum, written in the same
atomic batch, never a second truth.

## grant

Credits given rather than bought. A new account receives one on sign-up, and an
operator can write one by hand for support. A grant is a normal ledger entry
carrying its reason, so the decision behind it stays readable.

## generation

One attempt to turn a prompt into an image. It exists as a record before the
model is called, so a closed tab, a failure, or a refund all have something to
point at. It ends as succeeded or failed, and a failure either returns its
credits or, when the prompt was blocked, deliberately does not.

## credit pack

A quantity of credits sold for a fixed price. Packs are defined in code, not in
the database, and nothing about them is provisioned on the payment provider.

## share link

The one address at which an image belonging to one account can be read by
anybody. It exists only while its owner keeps it on. An image with a live share
link is never deleted by the retention sweep.

## payment confirmation

Trusted evidence that the payment provider received the exact amount for a
purchase and linked the payment to it. The webhook payload is a hint; the
confirmation is the transaction we read back ourselves.

## payment reconciliation

Comparing a purchase against payment confirmation and settling it when the
evidence matches. It runs on a schedule as well as on the webhook, and both
paths share one settlement, so running both can never grant credits twice.
