import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { getSetupStatus, runSetup } from "@/lib/setup.functions";

export const Route = createFileRoute("/setup")({
  component: SetupPage,
  loader: () => getSetupStatus(),
});

type SetupResult = Awaited<ReturnType<typeof runSetup>>;

function SetupPage() {
  const status = Route.useLoaderData();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SetupResult | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      setResult(
        await runSetup({
          data: {
            email: String(form.get("email") ?? ""),
            name: String(form.get("name") ?? ""),
            password: String(form.get("password") ?? ""),
          },
        })
      );
    } catch (setupError) {
      setError(
        setupError instanceof Error
          ? setupError.message
          : "Setup failed. Check the values and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-16 pb-32 sm:px-8">
        <p className="text-muted-foreground text-sm">Setup</p>
        <h1 className="mt-3 font-heading font-medium text-4xl tracking-[-0.05em]">
          Imagenation is ready.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Your administrator account exists. Nothing was seeded: credit packs
          live in <code>src/lib/pricing.ts</code> and images are made on demand.
        </p>

        <Alert
          className="mt-10"
          variant={result.imageKey.ok ? "default" : "destructive"}
        >
          <AlertTitle>
            {result.imageKey.ok
              ? "Your image key works"
              : "Your image key does not work"}
          </AlertTitle>
          <AlertDescription>
            {result.imageKey.ok
              ? "OpenRouter answered and the image model is available to this key. Put a spend limit on it before you take money."
              : `${result.imageKey.message}. Nobody can generate an image until this is fixed. Set OPENROUTER_API_KEY as a Worker secret and reload.`}
          </AlertDescription>
        </Alert>

        <Alert className="mt-6">
          <AlertTitle>One step left</AlertTitle>
          <AlertDescription>
            Register this URL as your Mayar webhook. It contains a secret, so
            treat it like a password. This page will not show it again.
          </AlertDescription>
          <code className="mt-4 block overflow-x-auto rounded-2xl bg-muted p-4 text-xs">
            {result.webhookUrl}
          </code>
          <AlertDescription className="mt-4">
            Registering it is optional. Payments are always proved by looking
            the transaction up with Mayar, and a scheduled job reconciles
            purchases every five minutes. The webhook only makes credits arrive
            faster.
          </AlertDescription>
        </Alert>

        <Link
          className="mt-8 inline-flex text-sm underline-offset-4 hover:underline"
          to="/admin"
        >
          Go to the admin area
        </Link>
      </main>
    );
  }

  if (status.complete) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-20 pb-32 text-center sm:px-8">
        <h1 className="font-heading font-medium text-4xl tracking-[-0.05em]">
          Setup already ran.
        </h1>
        <p className="mt-4 text-muted-foreground">
          Imagenation is configured. Sign in with your administrator account.
        </p>
        <Link
          className="mt-8 inline-flex text-sm underline-offset-4 hover:underline"
          to="/auth"
        >
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-5 pt-16 pb-32 sm:px-8">
      <p className="text-muted-foreground text-sm">Setup</p>
      <h1 className="mt-3 font-heading font-medium text-4xl tracking-[-0.05em]">
        Create your administrator.
      </h1>
      <p className="mt-4 text-muted-foreground text-sm leading-6">
        This runs once. It creates the first administrator, checks that your
        OpenRouter key can reach the image model, and generates your Mayar
        webhook secret.
      </p>

      <form className="mt-8" onSubmit={submit}>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="setup-name">Your name</FieldLabel>
            <Input id="setup-name" name="name" required type="text" />
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-email">Email</FieldLabel>
            <Input id="setup-email" name="email" required type="email" />
          </Field>
          <Field>
            <FieldLabel htmlFor="setup-password">Password</FieldLabel>
            <Input
              autoComplete="new-password"
              id="setup-password"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </Field>

          <FieldError>{error}</FieldError>

          <Button className="rounded-full" disabled={submitting} type="submit">
            {submitting ? <Spinner data-icon="inline-start" /> : null}
            Complete setup
          </Button>
        </FieldGroup>
      </form>
    </main>
  );
}
