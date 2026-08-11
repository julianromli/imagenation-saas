import {
  createFileRoute,
  getRouteApi,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";

import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const rootApi = getRouteApi("__root__");

export const Route = createFileRoute("/account/")({
  component: AccountPage,
  head: () => ({
    meta: [{ title: "Account — Imagenation" }],
  }),
  loader: () => getSession(),
});

function AccountPage() {
  const session = Route.useLoaderData();
  const { balance } = rootApi.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();

  if (!session) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          Sign in to Imagenation.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Your images, your credits, and your purchases live behind your
          account.
        </p>
        <Link
          className={cn(buttonVariants(), "mt-8 min-h-11 rounded-full px-5")}
          to="/auth"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-12 pb-24 sm:px-8">
      <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
        {session.user.name}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm">{session.user.email}</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link className="rounded-3xl border p-6 hover:bg-muted" to="/credits">
          <p className="text-muted-foreground text-sm">Balance</p>
          <p className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em] tabular-nums">
            {balance}
          </p>
          <p className="mt-2 text-muted-foreground text-sm">
            Buy more or read your credit history.
          </p>
        </Link>
        <Link className="rounded-3xl border p-6 hover:bg-muted" to="/history">
          <p className="font-medium">Your images</p>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Everything you have made, with its share link.
          </p>
        </Link>
      </div>

      {session.user.role === "admin" ? (
        <Link
          className="mt-4 block rounded-3xl border p-6 hover:bg-muted"
          to="/admin"
        >
          <p className="font-medium">Admin</p>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Balances, purchases, and failed generations.
          </p>
        </Link>
      ) : null}

      <Button
        className="mt-10 rounded-full"
        onClick={async () => {
          await authClient.signOut();
          await router.invalidate();
          await navigate({ to: "/" });
        }}
        type="button"
        variant="outline"
      >
        Sign out
      </Button>
    </main>
  );
}
