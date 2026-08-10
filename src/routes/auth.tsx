import {
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { SIGNUP_GRANT_CREDITS } from "@/lib/pricing";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [{ title: "Sign in — Imagenation" }],
  }),
});

/**
 * One page, two tabs.
 *
 * The tempting alternative is to ask for the email first and then decide which
 * form to show. That needs an endpoint answering "does this account exist",
 * which is an oracle anybody can query against any address. A tab costs one
 * click and leaks nothing.
 *
 * Sign-up is the default tab: with no landing page in front of it, a visitor
 * reaching this page is far more likely to be new than returning.
 */
function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-up");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");

    try {
      const result =
        mode === "sign-up"
          ? await authClient.signUp.email({
              email,
              name: String(form.get("name") ?? ""),
              password,
            })
          : await authClient.signIn.email({ email, password });

      if (result.error) {
        throw new Error(result.error.message);
      }

      // The header balance and the signup grant both come from the root
      // loader, so it has to run again before the app is shown.
      await router.invalidate();
      await navigate({ to: "/" });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "That did not work. Check the form and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-5 pt-16 pb-24 sm:px-8">
      <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
        {mode === "sign-up" ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mt-3 text-muted-foreground text-sm leading-6">
        {mode === "sign-up"
          ? `New accounts start with ${SIGNUP_GRANT_CREDITS} free credits — enough for two images.`
          : "Sign in to pick up where you left off."}
      </p>

      <div
        aria-label="Sign in or create an account"
        className="mt-8 grid grid-cols-2 gap-1 rounded-full border border-border/70 bg-muted/40 p-1 text-sm"
        role="tablist"
      >
        {(["sign-up", "sign-in"] as const).map((value) => (
          <button
            aria-selected={mode === value}
            className={cn(
              "min-h-10 rounded-full transition-[background-color,color,transform] duration-150 ease-out-quint active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              mode === value
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            )}
            key={value}
            onClick={() => {
              setMode(value);
              setError("");
            }}
            role="tab"
            type="button"
          >
            {value === "sign-up" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      <form className="mt-8 grid gap-5" onSubmit={submit}>
        {mode === "sign-up" ? (
          <div className="grid gap-2">
            <Label htmlFor="auth-name">Name</Label>
            <Input autoComplete="name" id="auth-name" name="name" required />
          </div>
        ) : null}
        <div className="grid gap-2">
          <Label htmlFor="auth-email">Email address</Label>
          <Input
            autoComplete="email"
            id="auth-email"
            name="email"
            required
            type="email"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="auth-password">Password</Label>
          <Input
            autoComplete={
              mode === "sign-up" ? "new-password" : "current-password"
            }
            id="auth-password"
            minLength={8}
            name="password"
            required
            type="password"
          />
          {mode === "sign-up" ? (
            <p className="text-muted-foreground text-xs">
              At least 8 characters.
            </p>
          ) : null}
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button
          className="min-h-11 rounded-full"
          disabled={submitting}
          type="submit"
        >
          {submitting ? <Spinner className="size-4" /> : null}
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}
