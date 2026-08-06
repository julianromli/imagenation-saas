# Reconcile payment invoices from local state

Checkout will persist a retryable local payment attempt before calling Mayar. The remote invoice request will use a stable order identity, and the local invoice fields will be attached after success. A local persistence failure will leave the order recoverable instead of releasing stock while an active remote invoice may remain.
