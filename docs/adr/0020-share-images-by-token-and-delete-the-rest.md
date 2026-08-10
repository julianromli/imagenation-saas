# Share images by token, and delete the rest after 90 days

A generated image is private to the account that made it. Prompts and their results are more personal than a product photo, so `/images/…` checks the session and answers with `Cache-Control: private`. The owner's id is inside the object key, so access is decided from the key and the session alone, with no database read. A missing session and a wrong owner both answer `404`: whether an image exists is not something a stranger should learn.

Sharing is off by default and set per image. Turning it on mints an unguessable token on the generation row and serves the bytes at `/api/shared/:token` as `public` and edge-cacheable, with a page at `/s/:token`. Turning it off deletes the token, and both paths stop resolving at once.

Making every image public but unguessable was rejected. An unguessable URL is still a URL, and it leaks through referrers, shared caches, and anything that indexes a link.

The prompt is shown on the shared page by default, with a per-image toggle. It is the interesting part of a shared image, and it is also the part somebody may not want public.

**Retention.** Generated images are deleted 90 days after they are made — unless they are shared. A boilerplate that accumulates R2 objects forever hands its operator an unbounded bill, and a link handed to somebody should not rot.

**Consequences**

- The five-minute cron does the sweep, deleting the R2 object first and clearing the key afterwards. The reverse order would lose the key and leak the object.
- The generation row survives the sweep. History keeps the prompt, the settings, and what it cost; only the image is gone, and the UI says so.
- Turning sharing on after 90 days is not possible, because the image is gone by then. That is stated in the history page rather than hidden.
- Reference images a user uploaded live under their own prefix and are read back server-side to build data URLs. The bucket is private, so a URL cannot be handed to the provider — and accepting URLs from the browser would let a caller aim the provider wherever they liked.
