/**
 * Builds the public address of a product image from its R2 object key.
 *
 * The key is what the database stores, because an address embeds a host and a
 * host changes. Everything that renders an image goes through here, so moving
 * to a custom domain later is one edit. See ADR-0013.
 */
export function productImageUrl(objectKey: string | null | undefined) {
  return objectKey ? `/images/${objectKey}` : null;
}
