import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { useState } from "react";
import { z } from "zod";

import { type CatalogProduct, ProductCard } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getCategories, getProducts } from "@/lib/catalog.functions";

const searchSchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
});

export const Route = createFileRoute("/products/")({
  component: ProductsPage,
  loader: () => Promise.all([getCategories(), getProducts({ data: {} })]),
  validateSearch: searchSchema,
});

function ProductsPage() {
  const [categories, products] = Route.useLoaderData() as [
    Array<{ id: string; name: string; slug: string }>,
    CatalogProduct[],
  ];
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/products/" });
  const [value, setValue] = useState(search.search ?? "");
  const visibleProducts = products.filter((product) => {
    const matchesSearch =
      !search.search ||
      product.name.toLowerCase().includes(search.search.toLowerCase());
    const matchesCategory =
      !search.category ||
      product.categoryName?.toLowerCase() === search.category;

    return matchesSearch && matchesCategory;
  });

  async function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await navigate({
      search: (current) => ({
        ...current,
        search: value.trim() || undefined,
      }),
    });
  }

  return (
    <main className="mx-auto max-w-7xl px-5 pt-14 pb-20 sm:px-8">
      <div className="flex flex-col justify-between gap-8 border-b pb-10 md:flex-row md:items-end">
        <div>
          <p className="text-muted-foreground text-sm">Shop</p>
          <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
            The collection
          </h1>
          <p className="mt-4 max-w-xl text-muted-foreground">
            Useful pieces with a little more thought in them.
          </p>
        </div>
        <search className="w-full max-w-sm">
          <form className="flex items-center gap-2" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="product-search">
              Search products
            </label>
            <Input
              id="product-search"
              onChange={(event) => setValue(event.target.value)}
              placeholder="Search products"
              type="search"
              value={value}
            />
            <Button aria-label="Search products" size="icon-lg" type="submit">
              <Search aria-hidden="true" />
            </Button>
          </form>
        </search>
      </div>

      <div className="flex flex-wrap gap-2 py-7">
        <Link
          className="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-muted [&.active]:bg-foreground [&.active]:text-background"
          search={{}}
          to="/products"
        >
          All products
        </Link>
        {categories.map((category) => (
          <Link
            className="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-muted [&.active]:bg-foreground [&.active]:text-background"
            key={category.id}
            search={{ category: category.slug }}
            to="/products"
          >
            {category.name}
          </Link>
        ))}
      </div>

      {visibleProducts.length > 0 ? (
        <div className="grid gap-x-5 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {visibleProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed p-14 text-center">
          <h2 className="font-medium">No products found</h2>
          <p className="mt-2 text-muted-foreground text-sm">
            Try another search or clear the current filter.
          </p>
          <Link
            className="mt-6 inline-flex text-sm underline-offset-4 hover:underline"
            search={{}}
            to="/products"
          >
            Clear filters
          </Link>
        </div>
      )}
    </main>
  );
}
