import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";

import { CategoryDialog } from "@/components/category-form-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { deleteCategory, getAdminCategories } from "@/lib/admin.functions";

type CategoryRow = {
  activeProducts: number;
  description: string | null;
  id: string;
  name: string;
  slug: string;
  totalProducts: number;
};

// `category` holds either "new" or the id being edited, so the open dialog
// survives a refresh and the back button closes it.
const searchSchema = z.object({
  category: z.string().optional(),
});

// biome-ignore assist/source/useSortedKeys: TanStack Router requires validateSearch before loader for search types to infer.
export const Route = createFileRoute("/admin/categories")({
  component: AdminCategories,
  validateSearch: searchSchema,
  loader: () => getAdminCategories(),
});

/**
 * Names what a delete actually costs. The category_id foreign key is
 * `set null`, so every product in the category — archived ones included —
 * comes out uncategorised.
 */
function deleteImpact(category: CategoryRow) {
  const archived = category.totalProducts - category.activeProducts;

  if (category.totalProducts === 0) {
    return "No products use this category.";
  }

  const products =
    category.totalProducts === 1
      ? "1 product"
      : `${category.totalProducts} products`;
  const suffix = archived > 0 ? ` (${archived} archived)` : "";

  return `${products}${suffix} will become uncategorized.`;
}

function AdminCategories() {
  const rows = Route.useLoaderData() as CategoryRow[];
  const router = useRouter();
  const navigate = useNavigate({ from: "/admin/categories" });
  const { category: openCategory } = Route.useSearch();
  const [pendingDelete, setPendingDelete] = useState<CategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isCreateOpen = openCategory === "new";
  const editingRow = rows.find((row) => row.id === openCategory);
  // A stale id would open an empty dialog. Drop it instead.
  const hasDeadTarget = Boolean(openCategory) && !isCreateOpen && !editingRow;
  // Keeps the last edited row on screen while the dialog animates out. State
  // rather than a ref, because a ref written during render survives a render
  // React later throws away.
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
    navigate({ search: { category: value } });
  }

  function closeDialog() {
    navigate({ replace: true, search: {} });
  }

  async function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    setDeleting(true);

    try {
      await deleteCategory({ data: { id: pendingDelete.id } });
      await router.invalidate();
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-muted-foreground text-sm">Catalog</p>
          <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
            Categories
          </h2>
        </div>
        <Button
          className="rounded-full"
          onClick={() => openDialog("new")}
          type="button"
        >
          <Plus aria-hidden="true" />
          Add category
        </Button>
      </div>

      {rows.length > 0 ? (
        <div className="mt-8">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Products</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="min-w-40 font-medium">
                    {category.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.slug}
                  </TableCell>
                  <TableCell className="max-w-sm text-muted-foreground text-sm">
                    {category.description || "—"}
                  </TableCell>
                  <TableCell>
                    {category.activeProducts > 0 ? (
                      <Badge variant="outline">
                        {category.activeProducts} active
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Empty</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        aria-label={`Edit ${category.name}`}
                        onClick={() => openDialog(category.id)}
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil aria-hidden="true" />
                      </Button>
                      <Button
                        aria-label={`Delete ${category.name}`}
                        className="hover:text-destructive"
                        onClick={() => setPendingDelete(category)}
                        size="icon"
                        variant="ghost"
                      >
                        <Trash2 aria-hidden="true" />
                      </Button>
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
              <Tags aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No categories yet</EmptyTitle>
            <EmptyDescription>
              Categories group products in the storefront filter. A category
              appears there once a product joins it.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              className="rounded-full"
              onClick={() => openDialog("new")}
              type="button"
            >
              <Plus aria-hidden="true" />
              Add category
            </Button>
          </EmptyContent>
        </Empty>
      )}

      <CategoryDialog
        onClose={closeDialog}
        onSaved={() => router.invalidate()}
        open={isCreateOpen}
      />
      {editRow ? (
        <CategoryDialog
          category={editRow}
          key={editRow.id}
          onClose={closeDialog}
          onSaved={() => router.invalidate()}
          open={Boolean(editingRow)}
        />
      ) : null}

      <AlertDialog
        onOpenChange={(next) => {
          if (!next) {
            setPendingDelete(null);
          }
        }}
        open={Boolean(pendingDelete)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {pendingDelete?.name ?? "category"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? deleteImpact(pendingDelete) : null} This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={confirmDelete}
              variant="destructive"
            >
              {deleting ? "Deleting" : "Delete category"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
