export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Every reference image is read into memory and base64-encoded before the
 * request leaves, and base64 is a third larger again. Fourteen images at the
 * single-image cap would be 56MB of bytes and roughly 75MB of string, against
 * a Worker limit of 128MB. This is the real ceiling; `MAX_REFERENCE_IMAGES` is
 * only the count.
 */
export const MAX_TOTAL_REFERENCE_BYTES = 12 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/** Images a user uploaded to steer a generation. */
export const REFERENCE_IMAGE_PREFIX = "references/";

/** Images the model produced. */
export const GENERATION_IMAGE_PREFIX = "generations/";

/** Extension for an R2 key, taken from what the model actually returned. */
export function extensionForMediaType(mediaType: string) {
  return ALLOWED_IMAGE_TYPES.get(mediaType) ?? "bin";
}

/**
 * Sends a reference image to the Worker, which writes it to R2 under the
 * caller's own prefix and returns the object key. Uploads go through the
 * Worker rather than a presigned URL, so no R2 credentials are needed at
 * deploy time. See ADR-0013.
 */
export async function uploadReferenceImage(file: File) {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, or AVIF image");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Choose an image of 4MB or less");
  }

  const response = await fetch("/api/uploads", {
    body: file,
    headers: { "Content-Type": file.type },
    method: "POST",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw new Error(body.error ?? "Unable to upload the image");
  }

  const { objectKey } = (await response.json()) as { objectKey: string };

  return objectKey;
}
