import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { CartProvider } from "@/components/cart-provider";
import { SetupGuideButton } from "@/components/setup-guide-button";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getSetupStatus } from "@/lib/setup.functions";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  component: RootComponent,
  errorComponent: ({ error, reset }) => (
    <main className="mx-auto max-w-xl px-5 pt-20 pb-32 sm:px-8">
      <p className="text-destructive text-sm">Unable to load</p>
      <h1 className="mt-3 font-heading font-medium text-4xl tracking-[-0.05em]">
        Something needs another try.
      </h1>
      <p className="mt-4 text-muted-foreground text-sm leading-6">
        {error instanceof Error
          ? error.message
          : "Check your connection and try again."}
      </p>
      <Button className="mt-6 rounded-full" onClick={reset} type="button">
        Try again
      </Button>
    </main>
  ),
  head: () => ({
    links: [
      {
        href: appCss,
        rel: "stylesheet",
      },
    ],
    meta: [
      {
        charSet: "utf-8",
      },
      {
        content: "width=device-width, initial-scale=1",
        name: "viewport",
      },
      {
        title: "then. — considered goods for everyday life",
      },
      {
        content:
          "Considered goods for everyday life. A single-merchant ecommerce starter.",
        name: "description",
      },
    ],
  }),
  /**
   * Only the one boolean the guide needs. `getSetupStatus` also reports whether
   * `SETUP_TOKEN` is configured, and that answer belongs to the setup page, not
   * to the SSR payload of every page in the store.
   */
  loader: async () => {
    try {
      const { complete } = await getSetupStatus();

      return { setupComplete: complete };
    } catch {
      // This loader now runs in front of every page. The guide is an
      // onboarding nicety and the storefront is the business, so a status read
      // that fails hides the button rather than taking the shop down with it.
      return { setupComplete: true };
    }
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-xl px-5 pt-20 pb-32 sm:px-8">
      <p className="text-muted-foreground text-sm">404</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        That page is not here.
      </h1>
      <p className="mt-4 text-muted-foreground">
        The link may be outdated or the page may have moved.
      </p>
    </main>
  ),
  pendingComponent: () => (
    <main className="mx-auto max-w-xl px-5 pt-20 pb-32 sm:px-8">
      <p className="text-muted-foreground text-sm">Loading</p>
      <h1 className="mt-3 font-heading font-medium text-4xl tracking-[-0.05em]">
        Getting things ready.
      </h1>
    </main>
  ),
  shellComponent: RootDocument,
});

function RootComponent() {
  const { setupComplete } = Route.useLoaderData();

  return (
    <>
      <Outlet />
      {setupComplete ? null : <SetupGuideButton />}
    </>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:rounded-full focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow-lg"
          href="#main-content"
        >
          Skip to content
        </a>
        <CartProvider>
          <SiteHeader />
          <div id="main-content">{children}</div>
          <SiteFooter />
        </CartProvider>
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}
