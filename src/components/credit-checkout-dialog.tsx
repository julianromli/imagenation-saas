import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatIdr } from "@/lib/format";
import type { MayarPaymentMethod, PaymentChannel } from "@/lib/payment-methods";
import {
  DEFAULT_PAYMENT_CHANNEL,
  findPaymentChannel,
  PAYMENT_CHANNELS,
} from "@/lib/payment-methods";
import type { CreditPack } from "@/lib/pricing";
import type { PurchaseView } from "@/lib/purchase";
import { pollPurchase, startPurchase } from "@/lib/purchase.functions";
import { cn } from "@/lib/utils";

/**
 * The QR encoder is only needed once a buyer has chosen QRIS, so it is kept out
 * of the initial bundle. It draws an inline SVG from the payment string: no
 * image service sees what somebody is paying.
 */
const QrCode = lazy(() =>
  import("qrcode.react").then((module) => ({ default: module.QRCodeSVG }))
);

/** How long to wait after a failed poll before asking again. */
const POLL_BACKOFF_MS = 15_000;

type CreditCheckoutDialogProps = {
  onOpenChange: (open: boolean) => void;
  /** Called once the payment lands, so the page can refresh the balance. */
  onSettled: () => void;
  open: boolean;
  pack: CreditPack;
  /** A payment already in flight, reopened from the purchases list. */
  resume?: PurchaseView | null;
  savedMobile: string | null;
};

export function CreditCheckoutDialog({
  onOpenChange,
  onSettled,
  open,
  pack,
  resume,
  savedMobile,
}: CreditCheckoutDialogProps) {
  const [purchase, setPurchase] = useState<PurchaseView | null>(resume ?? null);
  const [mobile, setMobile] = useState(savedMobile ?? "");
  const [method, setMethod] = useState<MayarPaymentMethod>(
    (resume?.paymentMethod as MayarPaymentMethod | undefined) ??
      DEFAULT_PAYMENT_CHANNEL
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Bumped to re-arm the poll timer without changing the purchase itself.
  const [attempt, setAttempt] = useState(0);

  // The state above is seeded from the props once and then owned here. The page
  // gives this component a `key` per payment, so reopening it mounts a fresh
  // one rather than needing the props synced back into state.
  const paid = purchase?.status === "paid";

  // One timer, re-armed by the effect itself each time the purchase changes.
  // A self-scheduling timeout rather than an interval, so a slow answer cannot
  // stack requests on top of each other.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is load-bearing. Bumping it is how a paused or failed poll re-arms this timer without touching the purchase.
  useEffect(() => {
    const awaiting = open && purchase?.status === "pending" ? purchase : null;

    let cancelled = false;
    let poll: ReturnType<typeof setTimeout> | undefined;
    let backoff: ReturnType<typeof setTimeout> | undefined;

    if (awaiting) {
      poll = setTimeout(() => {
        if (document.visibilityState === "hidden") {
          // Nobody is looking. Come back when they are.
          setAttempt((value) => value + 1);
          return;
        }

        pollPurchase({ data: { reference: awaiting.reference } })
          .then((next) => {
            if (cancelled) {
              return;
            }

            setPurchase(next);

            if (next.status === "paid") {
              onSettled();
            }
          })
          .catch(() => {
            // A refused or failed poll is not worth showing. Back off, retry.
            if (!cancelled) {
              backoff = setTimeout(
                () => setAttempt((value) => value + 1),
                POLL_BACKOFF_MS
              );
            }
          });
      }, awaiting.nextPollMs);
    }

    // One teardown for both timers, on every path.
    return () => {
      cancelled = true;
      clearTimeout(poll);
      clearTimeout(backoff);
    };
  }, [attempt, onSettled, open, purchase]);

  useEffect(() => {
    function wake() {
      if (document.visibilityState === "visible") {
        setAttempt((value) => value + 1);
      }
    }

    document.addEventListener("visibilitychange", wake);

    return () => document.removeEventListener("visibilitychange", wake);
  }, []);

  async function begin() {
    setBusy(true);
    setError("");

    try {
      setPurchase(
        await startPurchase({
          data: {
            mobile: mobile.trim(),
            packId: pack.id,
            paymentMethod: method,
          },
        })
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to start the payment"
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[90dvh] gap-5 overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {paid ? "Payment received" : `Buy ${pack.credits} credits`}
          </DialogTitle>
          <DialogDescription>
            {paid
              ? `${pack.credits} credits are on your account.`
              : `${pack.name} · ${formatIdr(pack.amount)}`}
          </DialogDescription>
        </DialogHeader>

        {paid ? <PaidStep credits={pack.credits} /> : null}

        {!paid && purchase ? <PayStep purchase={purchase} /> : null}

        {paid || purchase ? null : (
          <DetailsStep
            busy={busy}
            error={error}
            method={method}
            mobile={mobile}
            onMethodChange={setMethod}
            onMobileChange={setMobile}
            onSubmit={begin}
            savedMobile={savedMobile}
            total={pack.amount}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

type DetailsStepProps = {
  busy: boolean;
  error: string;
  method: MayarPaymentMethod;
  mobile: string;
  onMethodChange: (method: MayarPaymentMethod) => void;
  onMobileChange: (mobile: string) => void;
  onSubmit: () => void;
  savedMobile: string | null;
  total: number;
};

function DetailsStep({
  busy,
  error,
  method,
  mobile,
  onMethodChange,
  onMobileChange,
  onSubmit,
  savedMobile,
  total,
}: DetailsStepProps) {
  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="checkout-mobile">Mobile number</FieldLabel>
          <Input
            autoComplete="tel"
            id="checkout-mobile"
            inputMode="tel"
            onChange={(event) => onMobileChange(event.target.value)}
            placeholder="08123456789"
            required
            type="tel"
            value={mobile}
          />
          <FieldDescription>
            {savedMobile
              ? "Remembered from your last purchase."
              : "Mayar needs this on the invoice. It is asked once and remembered."}
          </FieldDescription>
        </Field>
      </FieldGroup>

      <fieldset className="grid gap-2">
        <legend className="mb-2 text-muted-foreground text-sm">
          How you want to pay
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_CHANNELS.map((channel) => (
            <ChannelButton
              channel={channel}
              key={channel.code}
              onSelect={onMethodChange}
              selected={channel.code === method}
            />
          ))}
        </div>
      </fieldset>

      {error ? <FieldError>{error}</FieldError> : null}

      <Button
        className="min-h-11 rounded-full"
        disabled={busy || mobile.trim().length < 8}
        type="submit"
      >
        {busy ? <Spinner data-icon="inline-start" /> : null}
        Pay {formatIdr(total)}
      </Button>
    </form>
  );
}

type ChannelButtonProps = {
  channel: PaymentChannel;
  onSelect: (method: MayarPaymentMethod) => void;
  selected: boolean;
};

function ChannelButton({ channel, onSelect, selected }: ChannelButtonProps) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "rounded-2xl border px-3 py-2.5 text-left transition-colors",
        selected
          ? "border-foreground bg-foreground text-background"
          : "hover:border-foreground/40"
      )}
      onClick={() => onSelect(channel.code)}
      type="button"
    >
      <span className="block font-medium text-sm">{channel.label}</span>
      <span
        className={cn(
          "block text-xs",
          selected ? "text-background/70" : "text-muted-foreground"
        )}
      >
        {channel.note}
      </span>
    </button>
  );
}

function PayStep({ purchase }: { purchase: PurchaseView }) {
  const detail = purchase.paymentDetail;

  return (
    <div className="grid gap-5">
      <div className="flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          {findPaymentChannel(purchase.paymentMethod ?? "")?.label ?? "Payment"}{" "}
          · {purchase.reference}
        </span>
        <span className="font-medium tabular-nums">
          {formatIdr(purchase.amount)}
        </span>
      </div>

      {detail?.kind === "qris" ? (
        <QrisPanel qrString={detail.qrString} />
      ) : null}

      {detail?.kind === "virtual_account" ? (
        <VirtualAccountPanel
          accountName={detail.accountName}
          accountNumber={detail.accountNumber}
          bank={detail.bank}
        />
      ) : null}

      {detail?.kind === "ewallet" ? (
        <EwalletPanel
          channel={detail.channel}
          links={detail.links}
          qrString={detail.qrString}
        />
      ) : null}

      {detail ? null : (
        <p className="text-muted-foreground text-sm">
          This payment has to be completed on Mayar's own page.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Spinner className="size-4" />
          Waiting for your payment
        </span>
        <Countdown expiresAt={purchase.expiresAt} />
      </div>

      {purchase.paymentUrl ? (
        <a
          className="inline-flex items-center gap-1.5 text-muted-foreground text-sm underline underline-offset-4 hover:text-foreground"
          href={purchase.paymentUrl}
          rel="noreferrer"
          target="_blank"
        >
          Open the Mayar payment page
          <ExternalLinkIcon className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

function QrisPanel({ qrString }: { qrString: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="rounded-3xl border bg-white p-4">
        <Suspense
          fallback={
            <div className="size-[200px] animate-pulse rounded-xl bg-muted" />
          }
        >
          <QrCode level="M" size={200} value={qrString} />
        </Suspense>
      </div>
      <p className="text-center text-muted-foreground text-xs">
        Scan with any bank or e-wallet app.
      </p>
    </div>
  );
}

type VirtualAccountPanelProps = {
  accountName: string | null;
  accountNumber: string;
  bank: string;
};

function VirtualAccountPanel({
  accountName,
  accountNumber,
  bank,
}: VirtualAccountPanelProps) {
  return (
    <div className="rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">{bank} virtual account</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="font-medium text-xl tabular-nums tracking-wide">
          {accountNumber}
        </p>
        <CopyButton value={accountNumber} />
      </div>
      {accountName ? (
        <p className="mt-2 text-muted-foreground text-xs">
          Account name {accountName}
        </p>
      ) : null}
      <p className="mt-3 text-muted-foreground text-xs">
        Transfer the exact amount. Your credits arrive on their own.
      </p>
    </div>
  );
}

type EwalletPanelProps = {
  channel: string;
  links: { kind: string; url: string }[];
  qrString: string | null;
};

function EwalletPanel({ channel, links, qrString }: EwalletPanelProps) {
  return (
    <div className="grid gap-3">
      {links.map((link) => (
        <a
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 font-medium text-primary-foreground text-sm"
          href={link.url}
          key={link.url + link.kind}
          rel="noreferrer"
          target="_blank"
        >
          {link.kind === "web"
            ? `Pay with ${channel} in a browser`
            : `Open ${channel}`}
        </a>
      ))}
      {qrString ? <QrisPanel qrString={qrString} /> : null}
      <p className="text-muted-foreground text-xs">
        Come back here once you have paid. This page updates on its own.
      </p>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(value).then(() => setCopied(true));
  }, [value]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = setTimeout(() => setCopied(false), 2000);

    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <Button onClick={copy} size="sm" type="button" variant="outline">
      {copied ? <CheckIcon /> : <CopyIcon />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function Countdown({ expiresAt }: { expiresAt: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);

    return () => clearInterval(timer);
  }, []);

  if (!expiresAt) {
    return null;
  }

  const left = Math.max(0, expiresAt - now);

  if (left === 0) {
    return <span className="text-muted-foreground text-sm">Expired</span>;
  }

  const minutes = Math.floor(left / 60_000);
  const seconds = Math.floor((left % 60_000) / 1000);

  return (
    <span className="text-muted-foreground text-sm tabular-nums">
      {minutes}:{String(seconds).padStart(2, "0")} left
    </span>
  );
}

function PaidStep({ credits }: { credits: number }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border px-4 py-4">
      <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <CheckIcon className="size-4" />
      </span>
      <p className="text-sm">
        <span className="font-medium tabular-nums">{credits}</span> credits
        added. You can close this.
      </p>
    </div>
  );
}
