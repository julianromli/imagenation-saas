import { createFileRoute } from "@tanstack/react-router";

import { listFailedGenerations } from "@/lib/admin.functions";
import { formatMoment } from "@/lib/format";

export const Route = createFileRoute("/admin/failures")({
  component: AdminFailures,
  loader: () => listFailedGenerations(),
});

function AdminFailures() {
  const failures = Route.useLoaderData();

  return (
    <section>
      <p className="text-muted-foreground text-sm">Failures</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        What went wrong, and who paid for it.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
        Everything refunds except a prompt blocked for content, which keeps the
        credits on purpose. A row marked "kept" that is not a moderation block
        is a bug worth chasing.
      </p>

      <ul className="mt-8 divide-y rounded-3xl border">
        {failures.map((failure) => (
          <li
            className="flex flex-wrap items-start justify-between gap-3 px-5 py-4"
            key={failure.id}
          >
            <span className="min-w-0 max-w-xl">
              <span className="block font-medium text-sm capitalize">
                {failure.errorCode ?? "unknown"} · {failure.resolution}
              </span>
              <span className="mt-1 block text-muted-foreground text-xs">
                {failure.email} · {formatMoment(failure.createdAt)}
              </span>
              {failure.errorMessage ? (
                <span className="mt-2 block text-muted-foreground text-xs leading-5">
                  {failure.errorMessage}
                </span>
              ) : null}
            </span>
            <span
              className={
                failure.refunded
                  ? "rounded-full bg-muted px-3 py-1 text-xs"
                  : "rounded-full bg-destructive/10 px-3 py-1 text-destructive text-xs"
              }
            >
              {failure.refunded
                ? `refunded ${failure.creditCost}`
                : `kept ${failure.creditCost}`}
            </span>
          </li>
        ))}
        {failures.length === 0 ? (
          <li className="px-5 py-10 text-center text-muted-foreground text-sm">
            Nothing has failed yet.
          </li>
        ) : null}
      </ul>
    </section>
  );
}
