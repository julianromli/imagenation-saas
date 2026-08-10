import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { adjustAccountCredits, listAccounts } from "@/lib/admin.functions";
import { formatMoment } from "@/lib/format";

export const Route = createFileRoute("/admin/accounts")({
  component: AdminAccounts,
  loader: () => listAccounts(),
});

function AdminAccounts() {
  const accounts = Route.useLoaderData();
  const [search, setSearch] = useState("");
  const filtered = accounts.filter((account) =>
    `${account.email} ${account.name}`
      .toLowerCase()
      .includes(search.trim().toLowerCase())
  );

  return (
    <section>
      <p className="text-muted-foreground text-sm">Accounts</p>
      <h2 className="mt-2 font-heading font-medium text-4xl tracking-[-0.05em]">
        Balances and adjustments.
      </h2>
      <p className="mt-3 max-w-2xl text-muted-foreground text-sm leading-6">
        An adjustment writes a ledger entry with your reason on it. The balance
        is never edited directly, so every decision stays readable later.
      </p>

      <Input
        aria-label="Search accounts"
        className="mt-6 max-w-sm"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by email or name"
        value={search}
      />

      <ul className="mt-6 divide-y rounded-3xl border">
        {filtered.map((account) => (
          <AccountRow account={account} key={account.id} />
        ))}
        {filtered.length === 0 ? (
          <li className="px-5 py-8 text-center text-muted-foreground text-sm">
            No accounts match that.
          </li>
        ) : null}
      </ul>
    </section>
  );
}

type AccountRowProps = {
  account: {
    balance: number;
    createdAt: number;
    email: string;
    id: string;
    name: string;
    role: string;
  };
};

function AccountRow({ account }: AccountRowProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [credits, setCredits] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function apply() {
    setBusy(true);
    setError("");

    try {
      await adjustAccountCredits({
        data: {
          credits: Number(credits),
          note: note.trim(),
          userId: account.id,
        },
      });

      setCredits("");
      setNote("");
      setOpen(false);
      await router.invalidate();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "That adjustment failed"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-medium text-sm">
            {account.name}
            {account.role === "admin" ? (
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-muted-foreground text-xs">
                admin
              </span>
            ) : null}
          </span>
          <span className="block truncate text-muted-foreground text-xs">
            {account.email} · joined {formatMoment(account.createdAt)}
          </span>
        </span>
        <span className="flex items-center gap-4">
          <span className="font-medium tabular-nums">{account.balance}</span>
          <Button
            className="min-h-9 rounded-full"
            onClick={() => setOpen((value) => !value)}
            size="sm"
            type="button"
            variant="outline"
          >
            Adjust
          </Button>
        </span>
      </div>

      {open ? (
        <div className="mt-4 grid gap-3 rounded-2xl bg-muted/50 p-4 sm:grid-cols-[8rem_1fr_auto]">
          <Input
            aria-label="Credits to add or remove"
            onChange={(event) => setCredits(event.target.value)}
            placeholder="e.g. 10 or -4"
            type="number"
            value={credits}
          />
          <Input
            aria-label="Reason"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Why (kept on the ledger)"
            value={note}
          />
          <Button
            className="min-h-10 rounded-full"
            disabled={busy || !Number(credits) || note.trim().length < 3}
            onClick={apply}
            type="button"
          >
            {busy ? <Spinner className="size-4" /> : null}
            Apply
          </Button>
          {error ? (
            <p className="text-destructive text-sm sm:col-span-3" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
