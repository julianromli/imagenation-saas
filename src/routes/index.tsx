import { createFileRoute, Link } from "@tanstack/react-router";

import { type CatalogProduct, ProductCard } from "@/components/product-card";
import { buttonVariants } from "@/components/ui/button";
import { getProducts } from "@/lib/catalog.functions";

export const Route = createFileRoute("/")({
  component: Home,
  loader: () => getProducts({ data: {} }),
});

function Home() {
  const products = Route.useLoaderData() as CatalogProduct[];

  return (
    <main>
      <section className="mx-auto grid max-w-7xl gap-10 px-5 pt-16 pb-20 sm:px-8 md:grid-cols-[1.2fr_0.8fr] md:items-center md:pt-24">
        <div>
          <p className="rise-in mb-6 text-muted-foreground text-sm [--n:0]">
            The first collection
          </p>
          <h1 className="rise-in max-w-3xl text-balance font-heading font-medium text-5xl tracking-[-0.06em] [--n:1] sm:text-7xl">
            Objects with a place in your everyday.
          </h1>
          <p className="rise-in mt-7 max-w-xl text-base text-muted-foreground leading-7 [--n:2] sm:text-lg">
            Small-batch goods, chosen for how they feel to use and how quietly
            they fit into a life.
          </p>
          <div className="rise-in mt-8 flex flex-wrap gap-3 [--n:3]">
            <Link className={buttonVariants({ size: "lg" })} to="/products">
              Browse the collection
            </Link>
            <a
              className={buttonVariants({ size: "lg", variant: "outline" })}
              href="#featured"
            >
              See what&apos;s new
            </a>
          </div>
        </div>
        <div className="rise-in relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-muted [--n:2] md:ml-auto md:w-full md:max-w-sm">
          <img
            alt="A considered home interior with warm natural textures"
            className="size-full object-cover"
            src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=85"
          />
          <div className="absolute inset-x-4 bottom-4 rounded-2xl bg-background/85 p-4 text-sm backdrop-blur">
            <p className="font-medium">Made for slower moments</p>
            <p className="mt-1 text-muted-foreground">
              Useful, tactile, and easy to live with.
            </p>
          </div>
        </div>
      </section>

      <section
        className="mx-auto max-w-7xl scroll-mt-8 px-5 pb-20 sm:px-8"
        id="featured"
      >
        <div className="mb-8 flex items-end justify-between gap-6">
          <div>
            <p className="text-muted-foreground text-sm">Curated for now</p>
            <h2 className="mt-2 font-heading font-medium text-3xl tracking-[-0.04em]">
              The everyday edit
            </h2>
          </div>
          <Link
            className="hidden text-sm underline-offset-4 hover:underline sm:block"
            to="/products"
          >
            View all products
          </Link>
        </div>
        {products.length > 0 ? (
          <div className="rise-in-children grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {products.slice(0, 4).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed p-10 text-center">
            <p className="font-medium">The collection is getting ready.</p>
            <p className="mt-2 text-muted-foreground text-sm">
              Run the setup command to load the demo catalog.
            </p>
          </div>
        )}
      </section>
    </main>
  );
}
