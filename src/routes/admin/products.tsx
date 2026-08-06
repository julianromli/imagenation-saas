import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Archive, LoaderCircle, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";

import { ProductImageUpload } from "@/components/product-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  archiveProduct,
  createCategory,
  createProduct,
  deleteCategory,
  getAdminProducts,
  updateProduct,
} from "@/lib/admin.functions";
import { getCategories } from "@/lib/catalog.functions";
import { formatIdr } from "@/lib/format";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  loader: () => Promise.all([getAdminProducts(), getCategories()]),
});

function AdminProducts() {
  const [rows, categories] = Route.useLoaderData();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      await createProduct({
        data: {
          categoryId: String(form.get("categoryId") || "") || null,
          description: String(form.get("description") ?? ""),
          name: String(form.get("name") ?? ""),
          price: Number(form.get("price") ?? 0),
          slug: String(form.get("slug") ?? ""),
          stock: Number(form.get("stock") ?? 0),
        },
      });
      event.currentTarget.reset();
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

      <form className="mt-8 rounded-3xl border p-6" onSubmit={addCategory}>
        <h3 className="font-medium">Manage categories</h3>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="flex-1 space-y-2" htmlFor="category-name">
            <span className="text-sm">Name</span>
            <Input id="category-name" name="categoryName" required />
          </label>
          <label className="flex-1 space-y-2" htmlFor="category-slug">
            <span className="text-sm">Slug</span>
            <Input
              id="category-slug"
              name="categorySlug"
              pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
              required
            />
          </label>
          <label className="flex-1 space-y-2" htmlFor="category-description">
            <span className="text-sm">Description</span>
            <Input id="category-description" name="categoryDescription" />
          </label>
        </div>
        <Button
          className="mt-5 rounded-full"
          disabled={categorySubmitting}
          type="submit"
          variant="outline"
        >
          {categorySubmitting ? "Saving category" : "Add category"}
        </Button>
        <div className="mt-5 flex flex-wrap gap-2">
          {categories.map((category) => (
            <span
              className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs"
              key={category.id}
            >
              {category.name}
              <button
                aria-label={`Delete ${category.name}`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:bg-background/80 hover:text-destructive active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                onClick={async () => {
                  await deleteCategory({ data: { id: category.id } });
                  await router.invalidate();
                }}
                type="button"
              >
                <X aria-hidden="true" className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      </form>

      <form className="mt-8 rounded-3xl border p-6" onSubmit={submit}>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-8 items-center justify-center rounded-xl bg-muted">
            <Plus aria-hidden="true" className="size-4" />
          </span>
          <h3 className="font-medium">Add a product</h3>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Name" name="name" required />
          <Field
            label="Slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            required
          />
          <Field
            label="Price in IDR"
            min={0}
            name="price"
            required
            type="number"
          />
          <Field
            label="Available stock"
            min={0}
            name="stock"
            required
            type="number"
          />
          <label className="space-y-2" htmlFor="new-product-category">
            <span className="text-sm">Category</span>
            <select
              className="h-9 w-full rounded-xl border border-input bg-background px-3 text-sm"
              defaultValue=""
              id="new-product-category"
              name="categoryId"
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label
            className="space-y-2 sm:col-span-2"
            htmlFor="new-product-description"
          >
            <span className="text-sm">Description</span>
            <Textarea
              id="new-product-description"
              name="description"
              required
            />
          </label>
        </div>
        {error ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {error}
          </p>
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

      <div className="mt-8 divide-y border-y">
        {rows.map(({ imageUrl, product }) => (
          <div className="py-5" key={product.id}>
            <div className="flex items-center gap-4">
              <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                {imageUrl ? (
                  <img
                    alt=""
                    className="size-full object-cover"
                    src={imageUrl}
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{product.name}</p>
                <p className="mt-1 text-muted-foreground text-sm">
                  {formatIdr(product.price)} · {product.availableStock}{" "}
                  available
                </p>
              </div>
              <div className="flex items-center gap-2">
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
                ) : (
                  <span className="rounded-full bg-muted px-3 py-1 text-muted-foreground text-xs">
                    Archived
                  </span>
                )}
              </div>
            </div>
            {editingId === product.id ? (
              <ProductEditForm
                categories={categories}
                onSaved={async () => {
                  setEditingId(null);
                  await router.invalidate();
                }}
                product={product}
              />
            ) : null}
          </div>
        ))}
      </div>
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
        <Input defaultValue={product.name} name="name" required />
        <Input defaultValue={product.slug} name="slug" required />
        <Input
          defaultValue={product.price}
          min={0}
          name="price"
          required
          type="number"
        />
        <Input
          defaultValue={product.availableStock}
          min={0}
          name="stock"
          required
          type="number"
        />
        <select
          aria-label="Category"
          className="h-9 rounded-xl border border-input bg-background px-3 text-sm"
          defaultValue={product.categoryId ?? ""}
          name="categoryId"
        >
          <option value="">No category</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <Textarea
          className="sm:col-span-2"
          defaultValue={product.description}
          name="description"
          required
        />
      </div>
      {error ? (
        <p className="mt-3 text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <Button className="mt-4 rounded-full" disabled={submitting} type="submit">
        {submitting ? "Saving changes" : "Save changes"}
      </Button>
    </form>
  );
}

function Field({
  label,
  min,
  name,
  pattern,
  required = false,
  type = "text",
}: {
  label: string;
  min?: number;
  name: string;
  pattern?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="space-y-2" htmlFor={name}>
      <span className="text-sm">{label}</span>
      <Input
        id={name}
        min={min}
        name={name}
        pattern={pattern}
        required={required}
        type={type}
      />
    </label>
  );
}
