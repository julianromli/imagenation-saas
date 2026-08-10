/**
 * Builds the address of an image from its R2 object key.
 *
 * The key is what the database stores, because an address embeds a host and a
 * host changes. Everything that renders an image goes through here, so moving
 * to a custom domain later is one edit. See ADR-0013.
 */
export function generationImageUrl(objectKey: string | null | undefined) {
  return objectKey ? `/images/${objectKey}` : null;
}

/**
 * The public address of a shared image. Private images are served from
 * `/images/…` behind a session check; this path is the only one a stranger can
 * reach, and only for a generation whose owner minted a token. See ADR-0020.
 */
export function shareUrl(shareToken: string) {
  return `/s/${shareToken}`;
}
