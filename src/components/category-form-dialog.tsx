import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useState } from "react";

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
import { Textarea } from "@/components/ui/textarea";
import { createCategory, updateCategory } from "@/lib/admin.functions";

export type EditableCategory = {
  description: string | null;
  id: string;
  name: string;
  slug: string;
};

type CategoryFormValues = {
  description: string;
  name: string;
  slug: string;
};

function readForm(form: HTMLFormElement): CategoryFormValues {
  const data = new FormData(form);

  return {
    description: String(data.get("description") ?? ""),
    name: String(data.get("name") ?? ""),
    slug: String(data.get("slug") ?? ""),
  };
}

function messageFrom(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function CategoryFormFields({
  category,
  idPrefix,
}: {
  category?: EditableCategory;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-name`}>Name</FieldLabel>
        <Input
          defaultValue={category?.name}
          id={`${idPrefix}-name`}
          name="name"
          required
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-slug`}>Slug</FieldLabel>
        <Input
          defaultValue={category?.slug}
          id={`${idPrefix}-slug`}
          name="slug"
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
          required
        />
        {category ? (
          <FieldDescription className="flex items-start gap-2">
            <TriangleAlert
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0"
            />
            <span>
              The storefront filters by slug. Changing it breaks any existing
              link to /products?category={category.slug}.
            </span>
          </FieldDescription>
        ) : (
          <FieldDescription>
            Lowercase letters, numbers, and hyphens. Used in the storefront
            address.
          </FieldDescription>
        )}
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-description`}>
          Description <span className="text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Textarea
          defaultValue={category?.description ?? ""}
          id={`${idPrefix}-description`}
          name="description"
        />
      </Field>
    </div>
  );
}

/**
 * One component for both create and edit. Unlike the product dialogs, the two
 * paths differ only in which server function runs — there is no create-only
 * state to keep out of the edit path, so splitting them would buy nothing.
 */
export function CategoryDialog({
  category,
  onClose,
  onSaved,
  open,
}: {
  category?: EditableCategory;
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_1fr_auto] overflow-hidden">
        <CategoryDialogBody
          category={category}
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
function CategoryDialogBody({
  category,
  onClose,
  onSaved,
}: {
  category?: EditableCategory;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const formId = category ? `edit-category-${category.id}` : "create-category";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    const values = readForm(event.currentTarget);

    try {
      if (category) {
        await updateCategory({ data: { ...values, id: category.id } });
      } else {
        await createCategory({ data: values });
      }

      await onSaved();
      onClose();
    } catch (saveError) {
      setError(messageFrom(saveError, "Unable to save category."));
      setSubmitting(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {category ? "Edit category" : "Add a category"}
        </DialogTitle>
        <DialogDescription>
          {category
            ? category.name
            : "Categories group products in the storefront filter."}
        </DialogDescription>
      </DialogHeader>

      <form className="contents" id={formId} onSubmit={submit}>
        <div className="-mx-6 overflow-y-auto px-6">
          <CategoryFormFields category={category} idPrefix={formId} />
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
          form={formId}
          type="submit"
        >
          {submitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Saving
            </>
          ) : (
            "Save category"
          )}
        </Button>
      </DialogFooter>
    </>
  );
}
