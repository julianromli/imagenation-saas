import {
  createFileRoute,
  redirect,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { authClient } from "@/lib/auth-client";
import { SIGNUP_GRANT_CREDITS } from "@/lib/pricing";
import { getSetupStatus } from "@/lib/setup.functions";

type Mode = "sign-in" | "sign-up";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    const { complete } = await getSetupStatus();

    if (!complete) {
      throw redirect({ to: "/setup" });
    }
  },
  component: AuthPage,
  head: () => ({
    meta: [{ title: "Sign in — Imagenation" }],
  }),
});

/**
 * One page, two modes.
 *
 * The tempting alternative is to ask for the email first and then decide which
 * form to show. That needs an endpoint answering "does this account exist",
 * which is an oracle anybody can query against any address. A switch costs one
 * click and leaks nothing.
 *
 * Sign-up is the default mode: with no landing page in front of it, a visitor
 * reaching this page is far more likely to be new than returning.
 *
 * The switch is a toggle group rather than tabs, because the form below is one
 * shared form, not two panels. Switching keeps whatever is already typed.
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

      <ToggleGroup
        aria-label="Sign in or create an account"
        className="mt-8 grid w-full grid-cols-2 rounded-full border border-border/70 bg-muted/40 p-1"
        onValueChange={(value: string[]) => {
          const [next] = value;

          // An empty group means the active item was clicked again. The mode
          // has to stay on something, so that click is ignored.
          if (next === "sign-in" || next === "sign-up") {
            setMode(next);
            setError("");
          }
        }}
        spacing={1}
        value={[mode]}
      >
        <ToggleGroupItem
          className="min-h-10 rounded-full text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          value="sign-up"
        >
          Create account
        </ToggleGroupItem>
        <ToggleGroupItem
          className="min-h-10 rounded-full text-muted-foreground aria-pressed:bg-foreground aria-pressed:text-background"
          value="sign-in"
        >
          Sign in
        </ToggleGroupItem>
      </ToggleGroup>

      <form className="mt-8" onSubmit={submit}>
        <FieldGroup>
          {/* Stays mounted in both modes: a transition needs two states to
              interpolate between. The -mb-6 cancels FieldGroup's gap-6, which
              a zero-height child would otherwise still claim; the pb-6 inside
              re-creates it so the gap collapses with the field. */}
          <div
            className="-mb-6 disclosure"
            data-open={mode === "sign-up"}
            inert={mode !== "sign-up"}
          >
            <div>
              <div className="pb-6">
                <Field>
                  <FieldLabel htmlFor="auth-name">Name</FieldLabel>
                  <Input
                    autoComplete="name"
                    id="auth-name"
                    name="name"
                    // `inert` hides the field but does not exempt it from
                    // constraint validation, so an unconditional `required`
                    // would block the sign-in form from ever submitting.
                    required={mode === "sign-up"}
                  />
                </Field>
              </div>
            </div>
          </div>
          <Field>
            <FieldLabel htmlFor="auth-email">Email address</FieldLabel>
            <Input
              autoComplete="email"
              id="auth-email"
              name="email"
              required
              type="email"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="auth-password">Password</FieldLabel>
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
              <FieldDescription>At least 8 characters.</FieldDescription>
            ) : null}
          </Field>

          <FieldError>{error}</FieldError>

          <Button
            className="min-h-11 rounded-full"
            disabled={submitting}
            type="submit"
          >
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            {mode === "sign-up" ? "Create account" : "Sign in"}
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
