# Serve images from the Worker

Images are uploaded through the Worker with `env.BUCKET.put()` and served back through a Worker route with cache headers. Presigned S3 uploads and a public bucket domain were both rejected: presigned uploads need an R2 access key and secret as extra deploy fields, and a public address needs either the `r2.dev` domain, which Cloudflare marks as not for production, or a custom domain, which a one-click deploy does not have.

This is the only combination that works the moment the deploy button finishes, with no dashboard step. See ADR-0014 for why that matters.

**Consequences**

- The database stores an R2 object key, not an absolute address. The public address is derived at render time, so moving to a custom domain later is one edit in `src/lib/images.ts`.
- The owner's user id is part of the key. Access is therefore decided from the key and the session alone, with no database read on the image path.
- Generated images are private by default and served with `Cache-Control: private`. Only an image its owner shared is public and edge-cacheable, on a separate path. See ADR-0020.
- The stored extension comes from the response `media_type`, never from an assumption. This model returns PNG below 2K and JPEG at 2K and above.
- Image resizing is out of scope. Cloudflare Images is a separate paid product and needs a zone.
