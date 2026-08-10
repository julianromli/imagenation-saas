import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Archive, ImagePlus, Pencil, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import {
  CreateProductDialog,
  EditProductDialog,
} from "@/components/product-form-dialog";
import { ProductImageUpload } from "@/components/product-image-upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  archiveProduct,
  getAdminCategories,
  getAdminProducts,
} from "@/lib/admin.functions";
import { formatIdr } from "@/lib/format";
import { productImageUrl } from "@/lib/images";

// `product` holds either "new" or the id of the product being edited, so the
// open dialog survives a refresh and the back button closes it.
const searchSchema = z.object({
  product: z.string().optional(),
});

// biome-ignore assist/source/useSortedKeys: TanStack Router requires validateSearch before loader for search types to infer.
export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
  validateSearch: searchSchema,
  loader: () => Promise.all([getAdminProducts(), getAdminCategories()]),
});

function AdminProducts() {
  const [rows, categories] = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate({ from: "/admin/products" });
  const { product: openProduct } = Route.useSearch();

  const isCreateOpen = openProduct === "new";
  const editingRow = rows.find(
    ({ product }) => product.id === openProduct && product.status === "active"
  );
  // A stale or archived id would open an empty dialog. Drop it instead.
  const hasDeadTarget = Boolean(openProduct) && !isCreateOpen && !editingRow;
  // Keeps the last edited row on screen while the dialog animates out. Without
  // it the popup would unmount the moment the search param clears. This is
  // state rather than a ref because a ref written during render survives a
  // render React later throws away.
  const [lastEditingRow, setLastEditingRow] = useState(editingRow);

  useEffect(() => {
    if (editingRow) {
      setLastEditingRow(editingRow);
    }
  }, [editingRow]);

  const editRow = editingRow ?? lastEditingRow;

  useEffect(() => {
    if (hasDeadTarget) {
      navigate({ replace: true, search: {} });
    }
  }, [hasDeadTarget, navigate]);

  function openDialog(value: string) {
    navigate({ search: { product: value } });
  }

  function closeDialog() {
    navigate({ replace: true, search: {} });
  }

  async function archive(id: string) {
    await archiveProduct({ data: { id } });
    await router.invalidate();
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Catalog</p>
          <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
            Products
          </h2>
        </div>
        <Button
          className="rounded-full"
          onClick={() => openDialog("new")}
          type="button"
        >
          <Plus aria-hidden="true" />
          Add product
        </Button>
      </div>

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
                <TableRow key={product.id}>
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
                            onClick={() => openDialog(product.id)}
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
              Add your first product to see it here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              className="rounded-full"
              onClick={() => openDialog("new")}
              type="button"
            >
              <Plus aria-hidden="true" />
              Add product
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <CreateProductDialog
        categories={categories}
        onClose={closeDialog}
        onSaved={() => router.invalidate()}
        open={isCreateOpen}
      />
      {editRow ? (
        <EditProductDialog
          categories={categories}
          imageObjectKey={editRow.imageObjectKey}
          key={editRow.product.id}
          onClose={closeDialog}
          onSaved={() => router.invalidate()}
          open={Boolean(editingRow)}
          product={editRow.product}
        />
      ) : null}
    </section>
  );
}
