import { TanStackDevtools } from "@tanstack/react-devtools";
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getBalanceSummary } from "@/lib/credits.functions";

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
        title: "Imagenation — describe it, and see it",
      },
      {
        content:
          "Generate images from a written description. Pay with credits, no subscription.",
        name: "description",
      },
    ],
  }),
  /**
   * The balance is read here rather than per page, because the header shows it
   * everywhere. This read is also what gives a new account its signup credits.
   * See ADR-0016.
   */
  loader: async () => {
    const balance = await getBalanceSummary().catch(() => ({
      balance: 0,
      signedIn: false as const,
    }));

    return {
      balance: balance.balance,
      signedIn: balance.signedIn,
    };
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
  const { balance, signedIn } = Route.useLoaderData();

  return (
    <>
      <SiteHeader balance={balance} signedIn={signedIn} />
      <div id="main-content">
        <Outlet />
      </div>
      <SiteFooter />
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
        {children}
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
