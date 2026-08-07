# Use the Cloudflare rate limiting binding

Supersedes ADR-0004.

ADR-0004 chose database counters so that one implementation would work on both Vercel and Cloudflare. ADR-0011 removes the Vercel target, so that reason no longer exists. Rate limits will use the Cloudflare rate limiting binding instead. All three existing windows are already 60 seconds, which the binding supports, so one binding covers each limit: 8 for order lookup, 12 for payment refresh, 20 for guest order claims, 10 for checkout, and 60 for webhook ingress.

The binding counts per Cloudflare location and is deliberately permissive rather than exact. This is accepted, because the protected paths do not need exact counting: an order lookup already demands both the email address and the order number, so guessing is expensive before the rate limit applies. Paying for a cross-region D1 write on every order lookup, to buy accuracy that changes no outcome, is the wrong price.

**Consequences**

- The `rate_limit_bucket` table is dropped, and the database-counter implementation inside `src/lib/rate-limit.ts` is replaced by a call to the binding. The module itself stays, so callers keep one place to go through.
- The webhook rate check required by ADR-0005 uses the same binding.
- If exact global counting is ever needed, a D1 counter remains a small change.
