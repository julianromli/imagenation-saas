/**
 * The payment channels we sell through, and the reader for what Mayar hands
 * back when a channel is pinned.
 *
 * This file is deliberately free of server imports. `mayar.ts` reaches for the
 * runtime environment and the API key, so a client component that imported the
 * parser from there would drag both into the browser bundle. The checkout
 * dialog needs the channel list and the detail type, so both live here.
 */

/**
 * Every value Mayar documents for `paymentMethod` on invoice create.
 *
 * Source: https://docs.mayar.id/api-reference-v2/invoice/create.md
 */
export const MAYAR_PAYMENT_METHODS = [
  "qris",
  "va/bni",
  "va/bri",
  "va/mandiri",
  "va/cimb",
  "va/permata",
  "va/bjb",
  "va/bsi",
  "ewallet/dana",
  "ewallet/gopay",
  "ewallet/linkaja",
  "ewallet/shopeepay",
  "ewallet/jenius",
  "outlet/alfamart",
] as const;

export type MayarPaymentMethod = (typeof MAYAR_PAYMENT_METHODS)[number];

export type PaymentChannelKind = "ewallet" | "qris" | "virtual_account";

export type PaymentChannel = {
  code: MayarPaymentMethod;
  /** What the buyer sees on the button. */
  label: string;
  kind: PaymentChannelKind;
  /** The one line under the label. Kept short: the grid is narrow. */
  note: string;
};

/**
 * What the checkout offers, in the order it offers it.
 *
 * `outlet/alfamart` is documented but absent: paying at a shop needs days, and
 * an invoice here lives for an hour. `ewallet/jenius` needs a `cashtag` on the
 * create call, which we never collect.
 *
 * A channel the Mayar account has switched off fails at create time, not here,
 * so this list has to match the account. See README.
 */
export const PAYMENT_CHANNELS: PaymentChannel[] = [
  {
    code: "qris",
    kind: "qris",
    label: "QRIS",
    note: "Any e-wallet or bank app",
  },
  {
    code: "va/bni",
    kind: "virtual_account",
    label: "BNI",
    note: "Virtual account",
  },
  {
    code: "va/bri",
    kind: "virtual_account",
    label: "BRI",
    note: "Virtual account",
  },
  {
    code: "va/mandiri",
    kind: "virtual_account",
    label: "Mandiri",
    note: "Virtual account",
  },
  {
    code: "va/bsi",
    kind: "virtual_account",
    label: "BSI",
    note: "Virtual account",
  },
  {
    code: "va/permata",
    kind: "virtual_account",
    label: "Permata",
    note: "Virtual account",
  },
  {
    code: "va/cimb",
    kind: "virtual_account",
    label: "CIMB Niaga",
    note: "Virtual account",
  },
  { code: "ewallet/dana", kind: "ewallet", label: "DANA", note: "E-wallet" },
  { code: "ewallet/gopay", kind: "ewallet", label: "GoPay", note: "E-wallet" },
  {
    code: "ewallet/shopeepay",
    kind: "ewallet",
    label: "ShopeePay",
    note: "E-wallet",
  },
  {
    code: "ewallet/linkaja",
    kind: "ewallet",
    label: "LinkAja",
    note: "E-wallet",
  },
];

export const DEFAULT_PAYMENT_CHANNEL: MayarPaymentMethod = "qris";

export function findPaymentChannel(code: string) {
  return PAYMENT_CHANNELS.find((channel) => channel.code === code);
}

export type PaymentLink = {
  kind: "deeplink" | "mobile" | "web";
  url: string;
};

/**
 * What the buyer needs on screen to pay, once a channel is pinned.
 *
 * Normalized, because the provider shape it comes from is undocumented: see
 * `parseMayarPaymentDetail`. Only these fields are stored, so an unrecognised
 * provider field can never reach the database or the page.
 */
export type MayarPaymentDetail =
  | {
      expiresAt: number | null;
      kind: "qris";
      qrString: string;
    }
  | {
      accountName: string | null;
      accountNumber: string;
      bank: string;
      expiresAt: number | null;
      kind: "virtual_account";
    }
  | {
      channel: string;
      expiresAt: number | null;
      kind: "ewallet";
      links: PaymentLink[];
      /** Some providers, ShopeePay among them, present a QR instead of a link. */
      qrString: string | null;
    };

/**
 * Schemes an e-wallet action URL is allowed to use.
 *
 * The URL comes from the provider and ends up in an `href`, so an allowlist is
 * the difference between a deeplink and stored cross-site scripting through
 * `javascript:`. Custom schemes are the Indonesian wallet apps; anything else
 * is dropped.
 */
const ALLOWED_LINK_SCHEMES = new Set([
  "dana:",
  "gojek:",
  "https:",
  "jenius:",
  "linkaja:",
  "ovo:",
  "shopee:",
  "shopeeid:",
]);

function record(value: unknown) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** An ISO timestamp or epoch milliseconds, as epoch milliseconds. */
function moment(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const raw = text(value);

  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);

  return Number.isNaN(parsed) ? null : parsed;
}

function safeUrl(value: unknown) {
  const raw = text(value);

  if (!raw) {
    return null;
  }

  try {
    return ALLOWED_LINK_SCHEMES.has(new URL(raw).protocol) ? raw : null;
  } catch {
    return null;
  }
}

function linkKind(value: unknown): PaymentLink["kind"] | null {
  switch (text(value)?.toUpperCase()) {
    case "DEEPLINK":
      return "deeplink";
    case "MOBILE":
      return "mobile";
    case "WEB":
      return "web";
    default:
      return null;
  }
}

function parseQris(detail: Record<string, unknown>): MayarPaymentDetail | null {
  const properties = record(record(detail.qr_code)?.channel_properties);
  const qrString = text(properties?.qr_string) ?? text(properties?.qrString);

  return qrString
    ? { expiresAt: moment(properties?.expires_at), kind: "qris", qrString }
    : null;
}

function parseVirtualAccount(
  detail: Record<string, unknown>
): MayarPaymentDetail | null {
  const account = record(detail.virtual_account);
  const properties = record(account?.channel_properties);
  const accountNumber = text(properties?.virtual_account_number);
  const bank = text(account?.channel_code);

  return accountNumber && bank
    ? {
        accountName: text(properties?.customer_name),
        accountNumber,
        bank,
        expiresAt: moment(properties?.expires_at),
        kind: "virtual_account",
      }
    : null;
}

function parseEwallet(
  detail: Record<string, unknown>
): MayarPaymentDetail | null {
  const wallet = record(detail.ewallet);
  const channel = text(wallet?.channel_code);
  const actions = Array.isArray(detail.actions) ? detail.actions : [];
  const links: PaymentLink[] = [];
  let qrString: string | null = null;

  for (const entry of actions) {
    const action = record(entry);

    if (!action) {
      continue;
    }

    // ShopeePay answers with a QR to present rather than a link to follow.
    qrString ??= text(action.qr_code);

    const kind = linkKind(action.url_type);
    const url = safeUrl(action.url);

    if (kind && url) {
      links.push({ kind, url });
    }
  }

  if (!channel || (links.length === 0 && !qrString)) {
    return null;
  }

  return {
    channel,
    expiresAt: moment(record(wallet?.channel_properties)?.expires_at),
    kind: "ewallet",
    links,
    qrString,
  };
}

/**
 * Reads Mayar's `paymentDetail` into something this app is willing to render.
 *
 * `paymentDetail` appears on the invoice create response and is documented
 * nowhere, so this is written against captured sandbox payloads and treats
 * every field as untrusted. It never throws, and anything it does not
 * recognise becomes `null` — which the checkout answers by falling back to the
 * hosted Mayar page, a field the documentation does define. See ADR-0021.
 *
 * Nothing here is evidence of payment. Credits are granted only from a
 * transaction we read back ourselves. See ADR-0005.
 */
export function parseMayarPaymentDetail(
  value: unknown
): MayarPaymentDetail | null {
  const detail = record(value);

  if (!detail) {
    return null;
  }

  switch (text(detail.type)?.toUpperCase()) {
    case "EWALLET":
      return parseEwallet(detail);
    case "QR_CODE":
      return parseQris(detail);
    case "VIRTUAL_ACCOUNT":
      return parseVirtualAccount(detail);
    default:
      return null;
  }
}

/**
 * Re-reads a stored detail.
 *
 * A row written by an older parser is just another untrusted shape, so it goes
 * through the same gate rather than being trusted because we wrote it.
 */
export function readStoredPaymentDetail(
  value: unknown
): MayarPaymentDetail | null {
  const stored = record(value);

  if (!stored) {
    return null;
  }

  switch (stored.kind) {
    case "ewallet": {
      const channel = text(stored.channel);
      const links = Array.isArray(stored.links) ? stored.links : [];
      const qrString = text(stored.qrString);
      const safeLinks: PaymentLink[] = [];

      for (const entry of links) {
        const link = record(entry);
        const kind = linkKind(link?.kind);
        const url = safeUrl(link?.url);

        if (kind && url) {
          safeLinks.push({ kind, url });
        }
      }

      return channel && (safeLinks.length > 0 || qrString)
        ? {
            channel,
            expiresAt: moment(stored.expiresAt),
            kind: "ewallet",
            links: safeLinks,
            qrString,
          }
        : null;
    }
    case "qris": {
      const qrString = text(stored.qrString);

      return qrString
        ? { expiresAt: moment(stored.expiresAt), kind: "qris", qrString }
        : null;
    }
    case "virtual_account": {
      const accountNumber = text(stored.accountNumber);
      const bank = text(stored.bank);

      return accountNumber && bank
        ? {
            accountName: text(stored.accountName),
            accountNumber,
            bank,
            expiresAt: moment(stored.expiresAt),
            kind: "virtual_account",
          }
        : null;
    }
    default:
      return null;
  }
}
