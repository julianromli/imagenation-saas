import { ImagePlus, LoaderCircle } from "lucide-react";
import { type ChangeEvent, useRef, useState } from "react";

import { setProductImage } from "@/lib/admin.functions";
import { useUploadThing } from "@/lib/uploadthing-client";
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
  const { isUploading, startUpload } = useUploadThing("productImage", {
    onClientUploadComplete: async (files) => {
      const file = files?.[0];

      if (!file?.ufsUrl) {
        setError("Upload completed without a file URL");
        return;
      }

      try {
        await setProductImage({
          data: {
            alt: productName,
            productId,
            url: file.ufsUrl,
          },
        });
        await onComplete();
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Unable to save uploaded image"
        );
      }
    },
    onUploadError: (uploadError) => {
      setError(uploadError.message);
    },
  });

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    setError("");
    await startUpload([file]);
    event.target.value = "";
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
        aria-label={`Upload image for ${productName}`}
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
        size="icon"
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
