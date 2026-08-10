import { Link } from "@tanstack/react-router";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  createProduct,
  setProductImage,
  updateProduct,
} from "@/lib/admin.functions";
import { productImageUrl } from "@/lib/images";
import { uploadProductImage } from "@/lib/uploads";

export type ProductFormCategory = { id: string; name: string };

export type EditableProduct = {
  availableStock: number;
  categoryId: string | null;
  description: string;
  id: string;
  name: string;
  price: number;
  slug: string;
};

type ProductFormValues = {
  categoryId: string | null;
  description: string;
  name: string;
  price: number;
  slug: string;
  stock: number;
};

function readForm(form: HTMLFormElement): ProductFormValues {
  const data = new FormData(form);

  return {
    categoryId: String(data.get("categoryId") || "") || null,
    description: String(data.get("description") ?? ""),
    name: String(data.get("name") ?? ""),
    price: Number(data.get("price") ?? 0),
    slug: String(data.get("slug") ?? ""),
    stock: Number(data.get("stock") ?? 0),
  };
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

/**
 * Uploads an image and points the product at it. Both dialogs stage the file
 * locally and only reach R2 on submit, so a cancelled dialog changes nothing.
 */
async function commitImage(
  product: { id: string; name: string },
  image: File
): Promise<void> {
  const objectKey = await uploadProductImage(image);

  await setProductImage({
    data: { alt: product.name, objectKey, productId: product.id },
  });
}

function ProductFormFields({
  categories,
  idPrefix,
  imageFile,
  imageObjectKey,
  onImageFileChange,
  product,
}: {
  categories: ProductFormCategory[];
  idPrefix: string;
  imageFile: File | null;
  imageObjectKey?: string | null;
  onImageFileChange: (file: File | null) => void;
  product?: EditableProduct;
}) {
  // Remounting the file input is the only way to clear its own selection.
  const [inputKey, setInputKey] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

  const currentImageUrl = productImageUrl(imageObjectKey);

  function clearSelection() {
    onImageFileChange(null);
    setInputKey((current) => current + 1);
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          defaultValue={product?.name}
          id={`${idPrefix}-name`}
          name="name"
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-slug`}>Slug</FieldLabel>
        <Input
          defaultValue={product?.slug}
          id={`${idPrefix}-slug`}
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-price`}>Price in IDR</FieldLabel>
        <Input
          defaultValue={product?.price}
          id={`${idPrefix}-price`}
          min={0}
          name="price"
          required
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-stock`}>Available stock</FieldLabel>
        <Input
          defaultValue={product?.availableStock}
          id={`${idPrefix}-stock`}
          min={0}
          name="stock"
          required
          type="number"
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-category`}>Category</FieldLabel>
        <NativeSelect
          className="w-full"
          defaultValue={product?.categoryId ?? ""}
          id={`${idPrefix}-category`}
          name="categoryId"
        >
          <NativeSelectOption value="">No category</NativeSelectOption>
          {categories.map((category) => (
            <NativeSelectOption key={category.id} value={category.id}>
              {category.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {categories.length === 0 ? (
          // Only shown when the select is empty. With categories present, a
          // link here would navigate away and discard the half-typed product.
          <FieldDescription>
            No categories yet.{" "}
            <Link
              className="underline underline-offset-3"
              to="/admin/categories"
            >
              Manage categories
            </Link>
            .
          </FieldDescription>
        ) : null}
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${idPrefix}-description`}>Description</FieldLabel>
        <Textarea
          defaultValue={product?.description}
          id={`${idPrefix}-description`}
          name="description"
          required
        />
      </Field>
      <Field className="sm:col-span-2">
        <FieldLabel htmlFor={`${idPrefix}-image`}>
          Product image{" "}
          <span className="text-muted-foreground">(optional)</span>
        </FieldLabel>
        <input
          accept="image/*"
          className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-medium file:text-foreground"
          id={`${idPrefix}-image`}
          key={inputKey}
          name="image"
          onChange={(event) =>
            onImageFileChange(event.target.files?.[0] ?? null)
          }
          type="file"
        />
        {imageFile && previewUrl ? (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              <img
                alt="Preview of selected product"
                className="size-full object-cover"
                src={previewUrl}
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-sm">
                {currentImageUrl ? "Replaces the current image" : "New image"}
              </p>
              <p className="mt-1 truncate text-muted-foreground text-xs">
                {imageFile.name}
              </p>
            </div>
            <Button
              aria-label="Remove selected product image"
              onClick={clearSelection}
              size="sm"
              type="button"
              variant="ghost"
            >
              Remove
            </Button>
          </div>
        ) : null}
        {!imageFile && currentImageUrl ? (
          <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
            <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              <img
                alt=""
                className="size-full object-cover"
                src={currentImageUrl}
              />
            </div>
            <p className="font-medium text-sm">Current image</p>
          </div>
        ) : null}
        <FieldDescription>
          One image, up to 4 MB. It is saved when you save the product.
        </FieldDescription>
      </Field>
    </div>
  );
}

export function CreateProductDialog({
  categories,
  onClose,
  onSaved,
  open,
}: {
  categories: ProductFormCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
  open: boolean;
}) {
  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] overflow-hidden sm:max-w-2xl">
        <CreateProductBody
          categories={categories}
          onClose={onClose}
          onSaved={onSaved}
        />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Holds the form state. It lives below `DialogContent` on purpose: the popup
 * subtree unmounts when the dialog closes, so every open starts clean without
 * an effect that watches `open` and resets.
 */
function CreateProductBody({
  categories,
  onClose,
  onSaved,
}: {
  categories: ProductFormCategory[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Set once the product row exists but its image did not make it. Retrying
  // must not create a second product, so the dialog stops being a create form.
  const [savedProduct, setSavedProduct] = useState<{
    id: string;
    name: string;
  } | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = readForm(event.currentTarget);
    const selectedImage = imageFile;

    try {
      const product = await createProduct({ data: values });

      if (!selectedImage) {
        await onSaved();
        onClose();
        return;
      }

      try {
        await commitImage(product, selectedImage);
        await onSaved();
        onClose();
      } catch (imageError) {
        setSavedProduct({ id: product.id, name: product.name });
        setError(
          messageFrom(imageError, "Unable to upload the image. Try again.")
        );
        await onSaved();
      }
    } catch (submissionError) {
      setError(messageFrom(submissionError, "Unable to create product."));
    } finally {
      setSubmitting(false);
    }
  }

  async function retryImage() {
    if (!(savedProduct && imageFile)) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      await commitImage(savedProduct, imageFile);
      await onSaved();
      onClose();
    } catch (imageError) {
      setError(
        messageFrom(imageError, "Unable to upload the image. Try again.")
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {savedProduct ? "Product saved, image failed" : "Add a product"}
        </DialogTitle>
        <DialogDescription>
          {savedProduct
            ? `${savedProduct.name} is in the catalog. Only the image did not upload.`
            : "Fields marked required must be filled before saving."}
        </DialogDescription>
      </DialogHeader>

      {savedProduct ? (
        <div className="overflow-y-auto">
          <div className="flex items-start gap-3 rounded-2xl border border-dashed p-4">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <ImagePlus aria-hidden="true" className="size-4" />
            </span>
            <p className="text-muted-foreground text-sm leading-6">
              Retry the upload, or press Done and add the image later from the
              product row.
            </p>
          </div>
          {error ? (
            <Alert className="mt-4" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      ) : (
        <form className="contents" id="create-product-form" onSubmit={submit}>
          <div className="-mx-6 overflow-y-auto px-6">
            <ProductFormFields
              categories={categories}
              idPrefix="new-product"
              imageFile={imageFile}
              onImageFileChange={setImageFile}
            />
            {error ? (
              <Alert className="mt-4" variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
        </form>
      )}

      <DialogFooter>
        {savedProduct ? (
          <>
            <DialogClose render={<Button variant="ghost" />}>Done</DialogClose>
            <Button
              className="rounded-full"
              disabled={submitting}
              onClick={retryImage}
              type="button"
            >
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Uploading image
                </>
              ) : (
                "Retry image upload"
              )}
            </Button>
          </>
        ) : (
          <>
            <DialogClose render={<Button variant="ghost" />}>
              Cancel
            </DialogClose>
            <Button
              className="rounded-full"
              disabled={submitting}
              form="create-product-form"
              type="submit"
            >
              {submitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                  Saving product
                </>
              ) : (
                "Save product"
              )}
            </Button>
          </>
        )}
      </DialogFooter>
    </>
  );
}

export function EditProductDialog({
  categories,
  imageObjectKey,
  onClose,
  onSaved,
  open,
  product,
}: {
  categories: ProductFormCategory[];
  imageObjectKey: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  open: boolean;
  product: EditableProduct;
}) {
  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] overflow-hidden sm:max-w-2xl">
        <EditProductBody
          categories={categories}
          imageObjectKey={imageObjectKey}
          onClose={onClose}
          onSaved={onSaved}
          product={product}
        />
      </DialogContent>
    </Dialog>
  );
}

/** State below `DialogContent`, so closing the dialog resets it. */
function EditProductBody({
  categories,
  imageObjectKey,
  onClose,
  onSaved,
  product,
}: {
  categories: ProductFormCategory[];
  imageObjectKey: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  product: EditableProduct;
}) {
  const [error, setError] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = readForm(event.currentTarget);
    const selectedImage = imageFile;

    try {
      await updateProduct({ data: { ...values, id: product.id } });

      // The update already applied. If the image throws, the dialog stays open
      // and pressing save again re-runs an update that changes nothing.
      if (selectedImage) {
        await commitImage(product, selectedImage);
      }

      await onSaved();
      onClose();
    } catch (updateError) {
      setError(messageFrom(updateError, "Unable to update product."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit product</DialogTitle>
        <DialogDescription>{product.name}</DialogDescription>
      </DialogHeader>

      <form className="contents" id="edit-product-form" onSubmit={submit}>
        <div className="-mx-6 overflow-y-auto px-6">
          <ProductFormFields
            categories={categories}
            idPrefix={`edit-${product.id}`}
            imageFile={imageFile}
            imageObjectKey={imageObjectKey}
            onImageFileChange={setImageFile}
            product={product}
          />
          {error ? (
            <Alert className="mt-4" variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </form>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button
          className="rounded-full"
          disabled={submitting}
          form="edit-product-form"
          type="submit"
        >
          {submitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Saving changes
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
