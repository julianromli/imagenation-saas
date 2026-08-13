import { z } from "zod";

import type { JsonObject } from "@/db/schema";
import type { MayarPaymentMethod } from "@/lib/payment-methods";
import { getRuntimeEnv, requireEnv } from "@/lib/runtime-env";

const invoiceResponseSchema = z.object({
  expiredAt: z.union([z.number(), z.string()]),
  id: z.string(),
  link: z.url(),
  /**
   * Undocumented, and read leniently on purpose. Pinning a `paymentMethod`
   * makes Mayar return the payment instrument here, but no V2 page defines the
   * shape, so a strict field would let an unrecognised response fail the whole
   * create. `parseMayarPaymentDetail` decides what is usable. See ADR-0021.
   */
  paymentDetail: z.unknown().optional().nullable(),
  transactionId: z.string(),
});

const transactionResponseSchema = z.object({
  amount: z.number(),
  extraData: z.unknown().optional().nullable(),
  id: z.string(),
  status: z.string(),
});

type InvoiceInput = {
  description: string;
  email: string;
  expiredAt: string;
  extraData: Record<string, string>;
  items: Array<{
    description: string;
    quantity: number;
    rate: number;
  }>;
  mobile: string;
  name: string;
  /**
   * Pins the invoice to one channel, which is what makes Mayar issue the QR
   * string, the virtual account, or the e-wallet deeplink on the create
   * response instead of leaving the buyer to choose on the hosted page.
   */
  paymentMethod?: MayarPaymentMethod;
  /**
   * Post-payment browser return URL. Official V1 docs document this field.
   * Sandbox-verified on V2 create: accepted and persisted on the invoice.
   */
  redirectUrl?: string;
};

/**
 * A transaction as Mayar returned it to us.
 *
 * The type exists so a settled payment can be handed the transaction the caller
 * already read instead of reading it again. Only `getMayarTransaction` produces
 * one, which keeps ADR-0005 intact: the evidence is still a transaction we
 * fetched ourselves, never a webhook payload.
 */
export type MayarTransaction = z.infer<typeof transactionResponseSchema>;

export type MayarWebhook = {
  amount: number | null;
  eventType: string;
  id: string;
  payload: JsonObject;
  status: string | boolean | null;
  transactionId: string | null;
};

/**
 * Mayar answered 429.
 *
 * Two different refusals share that status. `duplicate` is the documented
 * "wait one minute" on invoice create, which is keyed on the customer and the
 * amount — sandbox-verified: three creates for one customer at one amount are
 * refused however different the rest of the payload is. Anything else is the
 * 50-requests-a-minute key limit, which every caller must back off from rather
 * than retry. See ADR-0021.
 */
export class MayarRateLimitError extends Error {
  readonly duplicate: boolean;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    options: { duplicate: boolean; retryAfterSeconds: number | null }
  ) {
    super(message);
    this.name = "MayarRateLimitError";
    this.duplicate = options.duplicate;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isMayarRateLimit(error: unknown): error is MayarRateLimitError {
  return error instanceof MayarRateLimitError;
}

function apiBaseUrl() {
  return getRuntimeEnv().MAYAR_ENVIRONMENT === "production"
    ? "https://api.mayar.id/hl/v2"
    : "https://api.mayar.io/hl/v2";
}

function retryAfterFrom(response: Response) {
  const header = Number(response.headers.get("retry-after"));

  return Number.isFinite(header) && header > 0 ? header : null;
}

function refusal(message: string, response: Response, statusCode: number) {
  if (statusCode !== 429) {
    return new Error(`${message} (${statusCode})`);
  }

  return new MayarRateLimitError(message, {
    duplicate: message.toLowerCase().includes("duplicate"),
    retryAfterSeconds: retryAfterFrom(response),
  });
}

async function requestMayar<T>(
  path: string,
  init?: RequestInit,
  parse?: (value: unknown) => T
) {
  const response = await fetch(`${apiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${requireEnv("MAYAR_API_KEY")}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let message = "Mayar request failed";

    try {
      const body = (await response.json()) as {
        message?: string;
        messages?: string;
      };
      message = body.messages ?? body.message ?? message;
    } catch {
      // Keep the status-based error when Mayar returns a non-JSON response.
    }

    throw refusal(message, response, response.status);
  }

  const body = (await response.json()) as {
    data?: unknown;
    message?: string;
    messages?: string;
    statusCode?: number;
  };

  // The V2 envelope carries its own status, and it is not always the transport
  // status, so a 200 with `statusCode: 4xx` is still a refusal.
  if (body.statusCode !== undefined && body.statusCode >= 400) {
    const message = body.messages ?? body.message ?? "Mayar request failed";

    throw refusal(message, response, body.statusCode);
  }

  return parse ? parse(body.data) : (body.data as T);
}

/**
 * Exported so the lenient handling of `paymentDetail` can be tested without a
 * network call: absent, null, and nonsense all have to parse.
 */
export function parseInvoiceResponse(value: unknown) {
  return invoiceResponseSchema.parse(value);
}

export function createMayarInvoice(input: InvoiceInput) {
  return requestMayar(
    "/invoices/create",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    parseInvoiceResponse
  );
}

export function getMayarTransaction(transactionId: string) {
  return requestMayar(
    `/transactions/${encodeURIComponent(transactionId)}`,
    undefined,
    (value) => transactionResponseSchema.parse(value)
  );
}

export function createMayarVerificationPayload(
  eventId: string,
  transaction: { amount: number; id: string; status: string }
) {
  return {
    data: {
      amount: transaction.amount,
      status: transaction.status,
      transactionId: transaction.id,
    },
    eventType: "payment.received",
    id: eventId,
  };
}

function record(value: unknown): JsonObject {
  return typeof value === "object" && value !== null
    ? (value as JsonObject)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function parseMayarWebhook(payload: unknown): MayarWebhook {
  const root = record(payload);
  const data = record(root.data);
  const event = record(root.event);
  const eventType =
    stringValue(root.eventType) ??
    stringValue(root.event) ??
    stringValue(root.type) ??
    stringValue(event.received) ??
    stringValue(event.type) ??
    "unknown";
  const transactionStatus = data.transactionStatus ?? data.status;

  return {
    amount: typeof data.amount === "number" ? data.amount : null,
    eventType,
    id: stringValue(data.id) ?? stringValue(root.id) ?? crypto.randomUUID(),
    payload: root,
    status:
      typeof transactionStatus === "boolean" ||
      typeof transactionStatus === "string"
        ? transactionStatus
        : null,
    transactionId:
      stringValue(data.transactionId) ??
      stringValue(data.transaction_id) ??
      stringValue(data.id),
  };
}

export function isMayarPaid(status: string | boolean | null) {
  return status === true || status === "paid" || status === "PAID";
}
