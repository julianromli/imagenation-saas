# Use portable rate limits

Superseded by ADR-0015. Portability between Vercel and Cloudflare was the only reason for this decision, and ADR-0011 removes the Vercel target.

Public checkout and Mayar webhook requests will use atomic fixed-window counters stored in Neon. Counters will use a hashed client address and endpoint name, so the same protection works on Vercel and Cloudflare without requiring a second rate-limit service.
