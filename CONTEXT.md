# Domain context

## customer

A person who places or pays for an order.

## order

A customer purchase that contains items, delivery details, a total, and a
fulfillment lifecycle.

## payment status

The recorded state of whether an order's payment has been received.

## order status

The fulfillment state of an order after checkout.

## payment confirmation

Trusted evidence that the payment provider received the exact amount for the
order and linked the payment to that order.

## payment reconciliation

The process of comparing an order's payment status with payment confirmation
and correcting the recorded status when the evidence matches.

## checkout request

A single attempt to turn a cart into an order, named by a key the buyer's
browser chooses. The same key always names the same attempt, so a repeat of that
attempt is recognised as the same one and never becomes a second order.

## product image

A picture that represents a product. It is held as an object with a stable key,
not as an address. The public address is derived from the key at render time, so
the key stays correct when the address changes.
