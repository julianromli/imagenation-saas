import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { ClaimableGuestOrders } from "@/components/claimable-guest-orders";
import { Button, buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth.functions";
import { authClient } from "@/lib/auth-client";
import { getClaimableGuestOrders } from "@/lib/order.functions";

export const Route = createFileRoute("/account")({
  component: AccountPage,
  loader: async () => {
    const session = await getSession();

    return {
      claimableOrders: session ? await getClaimableGuestOrders() : [],
      session,
    };
  },
});

function AccountPage() {
  const { claimableOrders, session } = Route.useLoaderData();
  const navigate = useNavigate();

  if (!session) {
    return (
      <main className="mx-auto max-w-xl px-5 pt-20 pb-32 text-center sm:px-8">
        <p className="text-muted-foreground text-sm">Account</p>
        <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
          Keep your orders close.
        </h1>
        <p className="mt-5 text-muted-foreground">
          Sign in to see your order history, or check out as a guest.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link className={buttonVariants()} to="/sign-in">
            Sign in
          </Link>
          <Link
            className={buttonVariants({ variant: "outline" })}
            to="/sign-up"
          >
            Create account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-5 pt-14 pb-20 sm:px-8">
      <p className="text-muted-foreground text-sm">Account</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        Welcome, {session.user.name}.
      </h1>

      {claimableOrders.length > 0 ? (
        <div className="mt-10">
          <ClaimableGuestOrders orders={claimableOrders} />
        </div>
      ) : null}

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        <Link
          className="rounded-3xl border p-6 transition-colors hover:bg-muted"
          to="/account/orders"
        >
          <p className="font-medium">Order history</p>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            See your recent orders and their current progress.
          </p>
        </Link>
        <div className="rounded-3xl border p-6">
          <p className="font-medium">Account details</p>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {session.user.email}
          </p>
        </div>
      </div>
      <Button
        className="mt-8"
        onClick={async () => {
          await authClient.signOut();
          await navigate({ to: "/" });
        }}
        variant="outline"
      >
        Sign out
      </Button>
    </main>
  );
}
