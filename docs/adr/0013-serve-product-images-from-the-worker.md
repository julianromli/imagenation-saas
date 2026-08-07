# Serve product images from the Worker

UploadThing will be replaced by R2. Images will be uploaded through the Worker with `env.BUCKET.put()` and served back through a Worker route with cache headers. Presigned S3 uploads and a public bucket domain were both rejected: presigned uploads need an R2 access key and secret as extra deploy fields, and a public address needs either the `r2.dev` domain, which Cloudflare marks as not for production, or a custom domain, which a one-click deploy does not have.

This is the only combination that works the moment the deploy button finishes, with no dashboard step. See ADR-0014 for why that matters.

**Consequences**

- `product_image` stores an R2 object key, not an absolute address. The public address is derived at render time.
- `order_item` stores the same key. That column is a deliberate snapshot of the product at purchase time, so an embedded host would become unfixable history once orders exist.
- Deleting a product image deletes the R2 object as well, on a best-effort basis. A failed object delete must not fail the product update.
- Image resizing is out of scope. Cloudflare Images is a separate paid product and needs a zone.
