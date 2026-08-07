import { createFileRoute, useRouter } from "@tanstack/react-router";
import {
  Archive,
  ImagePlus,
  LoaderCircle,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";

import { ProductImageUpload } from "@/components/product-image-upload";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveProduct,
  createCategory,
  createProduct,
  deleteCategory,
  getAdminCategories,
  getAdminProducts,
  setProductImage,
  updateProduct,
} from "@/lib/admin.functions";
import { formatIdr } from "@/lib/format";
import { productImageUrl } from "@/lib/images";
import { uploadProductImage } from "@/lib/uploads";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  loader: () => Promise.all([getAdminProducts(), getAdminCategories()]),
});

function AdminProducts() {
  const [rows, categories] = Route.useLoaderData();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageInputKey, setImageInputKey] = useState(0);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [createdProduct, setCreatedProduct] = useState<{
    id: string;
    imageUploaded: boolean;
    name: string;
  } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }

    const previewUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(previewUrl);

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [imageFile]);

  function clearImageSelection() {
    setImageFile(null);
    setImageInputKey((current) => current + 1);
  }

  async function uploadImage(
    product: { id: string; name: string },
    image: File
  ): Promise<string | null> {
    try {
      const objectKey = await uploadProductImage(image);

      await setProductImage({
        data: {
          alt: product.name,
          objectKey,
          productId: product.id,
        },
      });
      return null;
    } catch (imageError) {
      return imageError instanceof Error
        ? `Product created, but image upload failed: ${imageError.message}`
        : "Product created, but image upload failed. Upload it again below.";
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const selectedImage = imageFile;

    try {
      const product = await createProduct({
        data: {
          categoryId: String(form.get("categoryId") || "") || null,
          description: String(form.get("description") ?? ""),
          name: String(form.get("name") ?? ""),
          price: Number(form.get("price") ?? 0),
          slug: String(form.get("slug") ?? ""),
          stock: Number(form.get("stock") ?? 0),
        },
      });
      setCreatedProduct({
        id: product.id,
        imageUploaded: false,
        name: product.name,
      });
      event.currentTarget.reset();
      setImageFile(null);

      if (selectedImage) {
        const imageError = await uploadImage(product, selectedImage);

        if (imageError) {
          setError(imageError);
        } else {
          setCreatedProduct((current) =>
            current ? { ...current, imageUploaded: true } : current
          );
        }
      }

      await router.invalidate();
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "Unable to create product."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function archive(id: string) {
    await archiveProduct({ data: { id } });
    await router.invalidate();
  }

  async function addCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCategorySubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      await createCategory({
        data: {
          description: String(form.get("categoryDescription") ?? ""),
          name: String(form.get("categoryName") ?? ""),
          slug: String(form.get("categorySlug") ?? ""),
        },
      });
      event.currentTarget.reset();
      await router.invalidate();
    } catch (categoryError) {
      setError(
        categoryError instanceof Error
          ? categoryError.message
          : "Unable to create category."
      );
    } finally {
      setCategorySubmitting(false);
    }
  }

  return (
    <section>
      <p className="text-muted-foreground text-sm">Catalog</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        Products
      </h2>

      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle>Manage categories</CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-5">
          <form onSubmit={addCategory}>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="category-name">Name</FieldLabel>
                <Input id="category-name" name="categoryName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="category-slug">Slug</FieldLabel>
                <Input
                  id="category-slug"
                  name="categorySlug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="category-description">
                  Description
                </FieldLabel>
                <Input id="category-description" name="categoryDescription" />
              </Field>
            </div>
            <Button
              className="mt-5 rounded-full"
              disabled={categorySubmitting}
              type="submit"
              variant="outline"
            >
              {categorySubmitting ? "Saving category" : "Add category"}
            </Button>
          </form>
          {categories.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-2">
              {categories.map((category) => (
                <Badge className="gap-2" key={category.id} variant="secondary">
                  {category.name}
                  <Button
                    aria-label={`Delete ${category.name}`}
                    className="size-5 rounded-full text-muted-foreground hover:bg-background/80 hover:text-destructive"
                    onClick={async () => {
                      await deleteCategory({ data: { id: category.id } });
                      await router.invalidate();
                    }}
                    size="icon-xs"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className="size-3.5" />
                  </Button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="mt-5 text-muted-foreground text-sm">
              No categories yet.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-8 rounded-3xl border bg-transparent shadow-none ring-0">
        <CardHeader className="p-6 pb-0">
          <CardTitle className="flex items-center gap-3">
            <span className="inline-flex size-8 items-center justify-center rounded-xl bg-muted">
              <Plus aria-hidden="true" className="size-4" />
            </span>
            Add a product
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 pt-6">
          <form onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="name">Name</FieldLabel>
                <Input id="name" name="name" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="slug">Slug</FieldLabel>
                <Input
                  id="slug"
                  name="slug"
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="price">Price in IDR</FieldLabel>
                <Input id="price" min={0} name="price" required type="number" />
              </Field>
              <Field>
                <FieldLabel htmlFor="stock">Available stock</FieldLabel>
                <Input id="stock" min={0} name="stock" required type="number" />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-product-category">Category</FieldLabel>
                <NativeSelect
                  className="w-full"
                  defaultValue=""
                  id="new-product-category"
                  name="categoryId"
                >
                  <NativeSelectOption value="">No category</NativeSelectOption>
                  {categories.map((category) => (
                    <NativeSelectOption key={category.id} value={category.id}>
                      {category.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="new-product-description">
                  Description
                </FieldLabel>
                <Textarea
                  id="new-product-description"
                  name="description"
                  required
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="new-product-image">
                  Product image{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </FieldLabel>
                <input
                  accept="image/*"
                  className="block w-full rounded-xl border border-input bg-background px-3 py-2 text-sm file:mr-4 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-1.5 file:font-medium file:text-foreground"
                  id="new-product-image"
                  key={imageInputKey}
                  name="image"
                  onChange={(event) =>
                    setImageFile(event.target.files?.[0] ?? null)
                  }
                  type="file"
                />
                {imageFile && imagePreviewUrl ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-muted/50 p-3">
                    <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                      <img
                        alt="Preview of selected product"
                        className="size-full object-cover"
                        src={imagePreviewUrl}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm">Image preview</p>
                      <p className="mt-1 truncate text-muted-foreground text-xs">
                        {imageFile.name}
                      </p>
                    </div>
                    <Button
                      aria-label="Remove selected product image"
                      onClick={clearImageSelection}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Remove
                    </Button>
                  </div>
                ) : null}
                <FieldDescription>One image, up to 4 MB.</FieldDescription>
              </Field>
            </div>
            {error ? (
              <Alert className="mt-4" variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button
              className="mt-6 rounded-full"
              disabled={submitting}
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
          </form>
        </CardContent>
      </Card>

      {createdProduct ? (
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-dashed p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted">
              <ImagePlus aria-hidden="true" className="size-4" />
            </span>
            <div>
              <p className="font-medium">Product created</p>
              <p className="mt-1 max-w-xl text-muted-foreground text-sm leading-6">
                {createdProduct.imageUploaded
                  ? "Image saved. You can replace it later from the product row."
                  : "Use the image button to add a file now, or upload it later from the product row."}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ProductImageUpload
              onComplete={async () => {
                await router.invalidate();
                setCreatedProduct((current) =>
                  current ? { ...current, imageUploaded: true } : current
                );
              }}
              productId={createdProduct.id}
              productName={createdProduct.name}
            />
            <Button
              onClick={() => setCreatedProduct(null)}
              size="sm"
              type="button"
              variant="ghost"
            >
              Done
            </Button>
          </div>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">
                  <span className="sr-only">Image</span>
                </TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ imageObjectKey, product }) => (
                <Fragment key={product.id}>
                  <TableRow>
                    <TableCell className="w-20">
                      <div className="size-16 overflow-hidden rounded-xl bg-muted">
                        {productImageUrl(imageObjectKey) ? (
                          <img
                            alt=""
                            className="size-full object-cover"
                            src={productImageUrl(imageObjectKey) ?? ""}
                          />
                        ) : (
                          <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground text-[10px]">
                            <ImagePlus aria-hidden="true" className="size-4" />
                            <span>No image</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="min-w-52">
                      <p className="font-medium">{product.name}</p>
                      <p className="mt-1 text-muted-foreground text-sm">
                        {product.slug}
                      </p>
                    </TableCell>
                    <TableCell>{formatIdr(product.price)}</TableCell>
                    <TableCell>{product.availableStock}</TableCell>
                    <TableCell>
                      {product.status === "active" ? (
                        <Badge variant="outline">Active</Badge>
                      ) : (
                        <Badge variant="secondary">Archived</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap justify-end gap-2">
                        {product.status === "active" ? (
                          <>
                            <Button
                              aria-label={`Edit ${product.name}`}
                              onClick={() =>
                                setEditingId((current) =>
                                  current === product.id ? null : product.id
                                )
                              }
                              size="icon"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" />
                            </Button>
                            <ProductImageUpload
                              onComplete={() => router.invalidate()}
                              productId={product.id}
                              productName={product.name}
                            />
                            <Button
                              aria-label={`Archive ${product.name}`}
                              onClick={() => archive(product.id)}
                              size="icon"
                              variant="ghost"
                            >
                              <Archive aria-hidden="true" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                  {editingId === product.id ? (
                    <TableRow>
                      <TableCell className="p-2" colSpan={6}>
                        <ProductEditForm
                          categories={categories}
                          onSaved={async () => {
                            setEditingId(null);
                            await router.invalidate();
                          }}
                          product={product}
                        />
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="mt-8 min-h-48">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ImagePlus aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No products yet</EmptyTitle>
            <EmptyDescription>
              Add your first product using the form above.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </section>
  );
}

function ProductEditForm({
  categories,
  onSaved,
  product,
}: {
  categories: Array<{ id: string; name: string }>;
  onSaved: () => Promise<void>;
  product: {
    availableStock: number;
    categoryId: string | null;
    description: string;
    id: string;
    name: string;
    price: number;
    slug: string;
  };
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      await updateProduct({
        data: {
          categoryId: String(form.get("categoryId") || "") || null,
          description: String(form.get("description") ?? ""),
          id: product.id,
          name: String(form.get("name") ?? ""),
          price: Number(form.get("price") ?? 0),
          slug: String(form.get("slug") ?? ""),
          stock: Number(form.get("stock") ?? 0),
        },
      });
      await onSaved();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Unable to update product."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-5 rounded-2xl bg-muted/60 p-4" onSubmit={submit}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`edit-name-${product.id}`}>Name</FieldLabel>
          <Input
            defaultValue={product.name}
            id={`edit-name-${product.id}`}
            name="name"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`edit-slug-${product.id}`}>Slug</FieldLabel>
          <Input
            defaultValue={product.slug}
            id={`edit-slug-${product.id}`}
            name="slug"
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`edit-price-${product.id}`}>
            Price in IDR
          </FieldLabel>
          <Input
            defaultValue={product.price}
            id={`edit-price-${product.id}`}
            min={0}
            name="price"
            required
            type="number"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`edit-stock-${product.id}`}>
            Available stock
          </FieldLabel>
          <Input
            defaultValue={product.availableStock}
            id={`edit-stock-${product.id}`}
            min={0}
            name="stock"
            required
            type="number"
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`edit-category-${product.id}`}>
            Category
          </FieldLabel>
          <NativeSelect
            className="w-full"
            defaultValue={product.categoryId ?? ""}
            id={`edit-category-${product.id}`}
            name="categoryId"
          >
            <NativeSelectOption value="">No category</NativeSelectOption>
            {categories.map((category) => (
              <NativeSelectOption key={category.id} value={category.id}>
                {category.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor={`edit-description-${product.id}`}>
            Description
          </FieldLabel>
          <Textarea
            defaultValue={product.description}
            id={`edit-description-${product.id}`}
            name="description"
            required
          />
        </Field>
      </div>
      {error ? (
        <Alert className="mt-3" variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="mt-4 rounded-full" disabled={submitting} type="submit">
        {submitting ? "Saving changes" : "Save changes"}
      </Button>
    </form>
  );
}
