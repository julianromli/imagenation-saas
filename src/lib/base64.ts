/**
 * Base64 for image payloads.
 *
 * `String.fromCharCode(...bytes)` is the obvious way to do this and it throws
 * on anything large: the arguments are spread onto the stack. A 7MB image is
 * seven million arguments. These helpers walk the buffer in chunks instead, so
 * the cost is linear and the stack stays flat.
 */

const CHUNK_SIZE = 8192;

export function bytesToBase64(bytes: Uint8Array) {
  let binary = "";

  for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + CHUNK_SIZE)
    );
  }

  return btoa(binary);
}

export function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
