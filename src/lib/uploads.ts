export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export const ALLOWED_IMAGE_TYPES = new Map([
  ["image/avif", "avif"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const PRODUCT_IMAGE_PREFIX = "products/";

/**
 * Sends an image to the Worker, which writes it to R2 and returns the object
 * key. Uploads go through the Worker rather than a presigned URL, so no R2
 * credentials are needed at deploy time. See ADR-0013.
 */
export async function uploadProductImage(file: File) {
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
