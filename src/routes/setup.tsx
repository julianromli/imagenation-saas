import { createFileRoute, Link } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
            token: String(form.get("token") ?? ""),
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

        <section
          className={
            result.imageKey.ok
              ? "mt-10 rounded-3xl border p-6"
              : "mt-10 rounded-3xl border border-destructive/40 bg-destructive/5 p-6"
          }
        >
          <h2 className="font-medium">
            {result.imageKey.ok
              ? "Your image key works"
              : "Your image key does not work"}
          </h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            {result.imageKey.ok
              ? "OpenRouter answered and the image model is available to this key. Put a spend limit on it before you take money."
              : `${result.imageKey.message}. Nobody can generate an image until this is fixed. Set OPENROUTER_API_KEY as a Worker secret and reload.`}
          </p>
        </section>

        <section className="mt-6 rounded-3xl border p-6">
          <h2 className="font-medium">One step left</h2>
          <p className="mt-2 text-muted-foreground text-sm leading-6">
            Register this URL as your Mayar webhook. It contains a secret, so
            treat it like a password. This page will not show it again.
          </p>
          <code className="mt-4 block overflow-x-auto rounded-2xl bg-muted p-4 text-xs">
            {result.webhookUrl}
          </code>
          <p className="mt-4 text-muted-foreground text-sm leading-6">
            Registering it is optional. Payments are always proved by looking
            the transaction up with Mayar, and a scheduled job reconciles
            purchases every five minutes. The webhook only makes credits arrive
            faster.
          </p>
        </section>

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

      {status.tokenConfigured ? null : (
        <p className="mt-6 rounded-2xl border border-destructive/40 p-4 text-destructive text-sm">
          SETUP_TOKEN is not set. Add it as a Worker secret, then reload.
        </p>
      )}

      <form className="mt-8 flex flex-col gap-4" onSubmit={submit}>
        <label className="flex flex-col gap-2 text-sm" htmlFor="setup-token">
          Setup token
          <Input
            autoComplete="off"
            id="setup-token"
            name="token"
            required
            type="password"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm" htmlFor="setup-name">
          Your name
          <Input id="setup-name" name="name" required type="text" />
        </label>
        <label className="flex flex-col gap-2 text-sm" htmlFor="setup-email">
          Email
          <Input id="setup-email" name="email" required type="email" />
        </label>
        <label className="flex flex-col gap-2 text-sm" htmlFor="setup-password">
          Password
          <Input
            autoComplete="new-password"
            id="setup-password"
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
          className="mt-2 rounded-full"
          disabled={submitting || !status.tokenConfigured}
          type="submit"
        >
          {submitting ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          Complete setup
        </Button>
      </form>
    </main>
  );
}
