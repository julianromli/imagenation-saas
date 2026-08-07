import { ImagePlus, LoaderCircle } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";

import { setProductImage } from "@/lib/admin.functions";
import { uploadProductImage } from "@/lib/uploads";
import { cn } from "@/lib/utils";

import { Button } from "./ui/button";

export function ProductImageUpload({
  onComplete,
  productId,
  productName,
}: {
  onComplete: () => Promise<void>;
  productId: string;
  productName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    setIsUploading(true);

    try {
      const objectKey = await uploadProductImage(file);

      await setProductImage({
        data: { alt: productName, objectKey, productId },
      });
      await onComplete();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Unable to save the uploaded image"
      );
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        accept="image/*"
        aria-label={`Select image for ${productName}`}
        className="sr-only"
        id={`image-${productId}`}
        onChange={chooseFile}
        ref={inputRef}
        type="file"
      />
      <Button
        aria-busy={isUploading}
        aria-label={`Upload image for ${productName}`}
        className="rounded-full"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        size="icon"
        title={`Upload image for ${productName}`}
        type="button"
        variant="outline"
      >
        <span className="relative size-4">
          <ImagePlus
            aria-hidden="true"
            className={cn(
              "absolute inset-0 size-4 transition-[filter,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
              isUploading
                ? "scale-[0.25] opacity-0 blur-[4px]"
                : "scale-100 opacity-100 blur-0"
            )}
          />
          <LoaderCircle
            aria-hidden="true"
            className={cn(
              "absolute inset-0 size-4 transition-[filter,opacity,transform] duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
              isUploading
                ? "animate-spin scale-100 opacity-100 blur-0"
                : "scale-[0.25] opacity-0 blur-[4px]"
            )}
          />
        </span>
      </Button>
      {error ? (
        <span
          className="max-w-32 text-right text-destructive text-xs"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
