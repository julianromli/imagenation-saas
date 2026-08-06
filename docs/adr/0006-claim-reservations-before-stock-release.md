# Claim reservations before releasing stock

Reservation cleanup will claim each row with a conditional status update before changing product stock. Both writes remain in one database transaction, so only the worker that changes `reserved` can return the quantity to available stock.
