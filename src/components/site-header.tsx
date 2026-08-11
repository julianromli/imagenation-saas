import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Menu, Sparkles, UserRound } from "lucide-react";
import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const primaryNavItems = [
  { label: "Create", to: "/" },
  { label: "History", to: "/history" },
  { label: "Credits", to: "/credits" },
] as const;

type SiteHeaderProps = {
  balance: number;
  signedIn: boolean;
};

export function SiteHeader({ balance, signedIn }: SiteHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-border/70 border-b bg-background/85 backdrop-blur-xl">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-4 px-5 sm:px-8 lg:grid lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            activeOptions={{ exact: true }}
            className="group shrink-0 rounded-sm font-heading font-semibold text-xl tracking-[-0.06em] transition-[color,transform] duration-150 ease-out-quint hover:text-muted-foreground active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
            to="/"
          >
            Imagenation
            <span className="sr-only"> home</span>
          </Link>
        </div>

        <nav
          aria-label="Primary navigation"
          className="hidden items-center gap-0.5 rounded-full border border-border/70 bg-muted/40 p-1 text-muted-foreground text-sm lg:flex lg:justify-self-center"
        >
          {primaryNavItems.map((item) => (
            <Link
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-full px-3 py-2 transition-[background-color,color,transform] duration-150 ease-out-quint hover:bg-background hover:text-foreground active:scale-[0.96] [&.active]:bg-foreground [&.active]:text-background"
              key={item.to}
              to={item.to}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 lg:justify-self-end">
          {signedIn ? (
            <Link
              className={cn(
                buttonVariants({ variant: "outline" }),
                "min-h-9 rounded-full"
              )}
              to="/credits"
            >
              <Sparkles aria-hidden="true" data-icon="inline-start" />
              <span className="tabular-nums bump-in" key={balance}>
                {balance}
              </span>
              <span className="text-muted-foreground">
                {balance === 1 ? "credit" : "credits"}
              </span>
            </Link>
          ) : (
            <Link
              className={cn(buttonVariants(), "min-h-9 rounded-full px-4")}
              to="/auth"
            >
              Sign in
            </Link>
          )}
          <Link
            aria-label="Open account"
            className={cn(
              buttonVariants({ size: "icon", variant: "ghost" }),
              "hidden size-10 rounded-full text-muted-foreground hover:text-foreground sm:inline-flex"
            )}
            to="/account"
          >
            <UserRound aria-hidden="true" />
          </Link>
          <Sheet onOpenChange={setMobileMenuOpen} open={mobileMenuOpen}>
            <SheetTrigger
              render={
                <Button
                  aria-label="Open navigation menu"
                  className="size-10 rounded-full lg:hidden"
                  size="icon"
                  variant="outline"
                />
              }
            >
              <Menu aria-hidden="true" />
            </SheetTrigger>
            <SheetContent
              className="w-full max-w-sm gap-0 bg-background p-0"
              side="right"
            >
              <SheetHeader className="border-border/70 border-b px-5 pt-6 pb-5 text-left">
                <SheetTitle className="text-left text-lg">Menu</SheetTitle>
                <SheetDescription className="text-left">
                  {signedIn
                    ? `${balance} ${balance === 1 ? "credit" : "credits"} left`
                    : "Sign in to start generating."}
                </SheetDescription>
              </SheetHeader>
              <div className="flex min-h-[calc(100dvh-6.5rem)] flex-col px-5 py-6">
                <nav aria-label="Mobile navigation" className="flex flex-col">
                  {primaryNavItems.map((item) => (
                    <Link
                      activeOptions={{ exact: item.to === "/" }}
                      className="group flex min-h-14 items-center justify-between border-border/70 border-b font-heading text-2xl tracking-[-0.04em] transition-[color,transform] duration-150 ease-out-quint first:border-t hover:text-muted-foreground active:scale-[0.96] [&.active]:text-muted-foreground"
                      key={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      to={item.to}
                    >
                      {item.label}
                      <ArrowUpRight
                        aria-hidden="true"
                        className="size-5 text-muted-foreground transition-transform duration-150 ease-out-quint group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                      />
                    </Link>
                  ))}
                </nav>

                <div className="mt-8 grid gap-2">
                  <Link
                    className={cn(
                      buttonVariants(),
                      "min-h-12 w-full justify-between rounded-full px-5"
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                    to={signedIn ? "/account" : "/auth"}
                  >
                    {signedIn ? "Account" : "Sign in"}
                    <UserRound aria-hidden="true" />
                  </Link>
                </div>

                <p className="mt-auto pt-10 text-muted-foreground text-xs uppercase tracking-[0.16em]">
                  Describe it, and see it.
                </p>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
