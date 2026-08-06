import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useCallback, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { mergeCart } from "@/lib/cart.functions";

export const Route = createFileRoute("/sign-up")({
  component: SignUpPage,
});

function SignUpPage() {
  const navigate = useNavigate();
  const { clear, lines } = useCart();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setError("");
      setSubmitting(true);
      const form = new FormData(event.currentTarget);

      try {
        const result = await authClient.signUp.email({
          email: String(form.get("email") ?? ""),
          name: String(form.get("name") ?? ""),
          password: String(form.get("password") ?? ""),
        });

        if (result.error) {
          throw new Error(result.error.message);
        }

        if (lines.length > 0) {
          await mergeCart({ data: lines });
          clear();
        }

        await navigate({ to: "/account" });
      } catch (submissionError) {
        setError(
          submissionError instanceof Error
            ? submissionError.message
            : "Unable to create your account. Check the form and try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [clear, lines, navigate]
  );

  return (
    <main className="mx-auto max-w-md px-5 pt-20 pb-32 sm:px-8">
      <p className="text-muted-foreground text-sm">Account</p>
      <h1 className="mt-3 font-heading font-medium text-5xl tracking-[-0.06em]">
        Create account
      </h1>
      <p className="mt-4 text-muted-foreground">
        Save your order history while keeping guest checkout available.
      </p>
      <form className="mt-10 space-y-5" onSubmit={submit}>
        <label className="block space-y-2" htmlFor="sign-up-name">
          <span className="text-sm">Name</span>
          <Input autoComplete="name" id="sign-up-name" name="name" required />
        </label>
        <label className="block space-y-2" htmlFor="sign-up-email">
          <span className="text-sm">Email address</span>
          <Input
            autoComplete="email"
            id="sign-up-email"
            name="email"
            required
            type="email"
          />
        </label>
        <label className="block space-y-2" htmlFor="sign-up-password">
          <span className="text-sm">Password</span>
          <Input
            autoComplete="new-password"
            id="sign-up-password"
            minLength={8}
            name="password"
            required
            type="password"
          />
        </label>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <Button
          className="h-11 w-full rounded-full"
          disabled={submitting}
          type="submit"
        >
          {submitting ? (
            <>
              <LoaderCircle aria-hidden="true" className="animate-spin" />
              Creating account
            </>
          ) : (
            "Create account"
          )}
        </Button>
      </form>
      <p className="mt-7 text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link
          className="text-foreground underline-offset-4 hover:underline"
          to="/sign-in"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
