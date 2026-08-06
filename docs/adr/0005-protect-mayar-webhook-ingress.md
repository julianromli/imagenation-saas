# Protect Mayar webhook ingress

Mayar webhook delivery will use an unguessable secret path because the documented contract does not provide a signature header. The endpoint will also enforce request-size, payload, and rate checks, and webhook data will never prove payment without a verified transaction lookup.
