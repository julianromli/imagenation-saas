import { z } from "zod";

import type { JsonObject } from "@/db/schema";
import { getRuntimeEnv, requireEnv } from "@/lib/runtime-env";

const invoiceResponseSchema = z.object({
  expiredAt: z.union([z.number(), z.string()]),
  id: z.string(),
  link: z.string().url(),
  transactionId: z.string(),
});

const transactionResponseSchema = z.object({
  amount: z.number(),
  extraData: z.unknown().optional().nullable(),
  id: z.string(),
  status: z.string(),
});

type InvoiceInput = {
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
  description: string;
};

export type MayarWebhook = {
  amount: number | null;
  eventType: string;
  id: string;
  payload: JsonObject;
  status: string | boolean | null;
  transactionId: string | null;
};

function apiBaseUrl() {
  return getRuntimeEnv().MAYAR_ENVIRONMENT === "production"
    ? "https://api.mayar.id/hl/v2"
    : "https://api.mayar.io/hl/v2";
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
  const body = (await response.json()) as {
    data?: unknown;
    message?: string;
    messages?: string;
    statusCode?: number;
  };

  if (
    !response.ok ||
    (body.statusCode !== undefined && body.statusCode >= 400)
  ) {
    const message = body.messages ?? body.message ?? "Mayar request failed";

    throw new Error(`${message} (${response.status})`);
  }

  return parse ? parse(body.data) : (body.data as T);
}

export function createMayarInvoice(input: InvoiceInput) {
  return requestMayar(
    "/invoices/create",
    {
      body: JSON.stringify(input),
      method: "POST",
    },
    (value) => invoiceResponseSchema.parse(value)
  );
}

export function getMayarTransaction(transactionId: string) {
  return requestMayar(
    `/transactions/${encodeURIComponent(transactionId)}`,
    undefined,
    (value) => transactionResponseSchema.parse(value)
  );
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
