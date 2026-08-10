export function createId() {
  return crypto.randomUUID();
}

/**
 * The reference a buyer sees and quotes at support. It is not the primary key:
 * the key is a UUID, and this is the readable name for it.
 */
export function createPurchaseReference() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const suffix = crypto.randomUUID().slice(0, 6).toUpperCase();

  return `IMG-${stamp}-${suffix}`;
}

export function createAccessToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token)
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
