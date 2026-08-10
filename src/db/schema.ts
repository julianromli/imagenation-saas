import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export type JsonValue =
  | boolean
  | JsonObject
  | JsonValue[]
  | null
  | number
  | string;
export type JsonObject = { [key: string]: JsonValue };

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .$defaultFn(() => new Date())
    .notNull(),
};

// SQLite has no enum type. These lists give Drizzle a typed union on the column.
// They are not checked at runtime, so every write must go through typed code.

/** Why a credit entry exists. One term per idea; see CONTEXT.md. */
export const CREDIT_REASON = [
  "grant",
  "purchase",
  "spend",
  "refund",
  "adjustment",
] as const;

export const GENERATION_STATUS = ["pending", "succeeded", "failed"] as const;

/**
 * Why a generation failed. `moderation` is deliberately separate from the
 * rest: it is the only failure that keeps the credits, so refund logic reads
 * this column rather than re-deriving intent from an error message.
 */
export const GENERATION_ERROR = [
  "moderation",
  "rate_limited",
  "upstream",
  "timeout",
  "invalid",
] as const;

export const PURCHASE_STATUS = [
  "pending",
  "paid",
  "expired",
  "failed",
] as const;

export const WEBHOOK_EVENT_STATUS = [
  "completed",
  "received",
  "processing",
  "processed",
  "ignored",
  "failed",
] as const;

export const users = sqliteTable(
  "user",
  {
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .default(false)
      .notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    // Mayar requires a mobile number on every invoice, so a buyer is asked for
    // one at their first purchase and it is remembered. Nobody who only
    // generates images is ever asked.
    mobile: text("mobile"),
    name: text("name").notNull(),
    role: text("role").default("customer").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)]
);

export const sessions = sqliteTable(
  "session",
  {
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ip_address"),
    token: text("token").notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("session_token_unique").on(table.token),
    index("session_user_id_idx").on(table.userId),
  ]
);

export const accounts = sqliteTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }),
    accountId: text("account_id").notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp_ms",
    }),
    scope: text("scope"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verifications = sqliteTable(
  "verification",
  {
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

/**
 * The spendable balance, one row per user.
 *
 * This is a cache of the sum of `credit_entry`, not a second truth. Every
 * write updates both in one D1 batch. The CHECK is the overspend guard: a
 * spend that would take the balance below zero aborts the batch, exactly as
 * the parent template guarded stock. See ADR-0016.
 */
export const creditAccounts = sqliteTable(
  "credit_account",
  {
    balance: integer("balance").default(0).notNull(),
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    check("credit_account_balance_not_negative", sql`${table.balance} >= 0`),
  ]
);

/**
 * Append-only. A row is never updated or deleted, so the balance can always be
 * rebuilt by summing `delta`.
 *
 * `idrValue` is recorded on purchases and grants only. A spend is denominated
 * in credits, and a later price change must not rewrite what an old spend
 * cost. See CONTEXT.md.
 */
export const creditEntries = sqliteTable(
  "credit_entry",
  {
    delta: integer("delta").notNull(),
    id: text("id").primaryKey(),
    idrValue: integer("idr_value"),
    note: text("note"),
    reason: text("reason", { enum: CREDIT_REASON }).notNull(),
    refId: text("ref_id").notNull(),
    refType: text("ref_type").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("credit_entry_user_created_idx").on(table.userId, table.createdAt),
    // The double-credit guard. A repeated Mayar webhook and a repeated refund
    // both violate this, which aborts the batch instead of paying twice.
    unique("credit_entry_ref_unique").on(
      table.refType,
      table.refId,
      table.reason
    ),
  ]
);

/**
 * One attempt to turn a prompt into an image. The row is written before the
 * model is called, so a closed tab, a crash, or a refund all have something to
 * point at. See ADR-0017.
 */
export const generations = sqliteTable(
  "generation",
  {
    aspectRatio: text("aspect_ratio").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    creditCost: integer("credit_cost").notNull(),
    errorCode: text("error_code", { enum: GENERATION_ERROR }),
    errorMessage: text("error_message"),
    id: text("id").primaryKey(),
    mediaType: text("media_type"),
    model: text("model").notNull(),
    // R2 object key, not an address. See ADR-0013.
    objectKey: text("object_key"),
    prompt: text("prompt").notNull(),
    // R2 keys of the reference images this generation was given, in order.
    referenceKeys: text("reference_keys", { mode: "json" })
      .$type<string[]>()
      .default([])
      .notNull(),
    refundedAt: integer("refunded_at", { mode: "timestamp_ms" }),
    resolution: text("resolution").notNull(),
    sharePromptVisible: integer("share_prompt_visible", { mode: "boolean" })
      .default(true)
      .notNull(),
    // Null until the owner shares it. Presence is what makes the image public
    // and what exempts it from the retention sweep.
    shareToken: text("share_token"),
    status: text("status", { enum: GENERATION_STATUS })
      .default("pending")
      .notNull(),
    // What the call actually cost upstream, in USD. Never shown to a user, and
    // impossible to recover later, so it is stored on every row.
    upstreamCostUsd: real("upstream_cost_usd"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("generation_user_created_idx").on(table.userId, table.createdAt),
    // The cron scans by status and age to refund whatever got stuck.
    index("generation_status_created_idx").on(table.status, table.createdAt),
    uniqueIndex("generation_share_token_unique").on(table.shareToken),
    // One in-flight generation per user, decided by the database rather than
    // by a read-then-write the next request can race.
    uniqueIndex("generation_one_pending_per_user")
      .on(table.userId)
      .where(sql`status = 'pending'`),
  ]
);

/**
 * The idempotency key the browser sends with a generate request. A repeat
 * violates this primary key, which aborts the batch and prevents a second
 * charge. See ADR-0002 and ADR-0003.
 */
export const generationRequests = sqliteTable(
  "generation_request",
  {
    fingerprint: text("fingerprint").notNull(),
    generationId: text("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    index("generation_request_generation_id_idx").on(table.generationId),
  ]
);

/** One attempt to buy a credit pack through a Mayar invoice. */
export const creditPurchases = sqliteTable(
  "credit_purchase",
  {
    amount: integer("amount").notNull(),
    // Set when the credits reach the ledger, so a replayed webhook and the
    // reconciliation job cannot both grant.
    creditedAt: integer("credited_at", { mode: "timestamp_ms" }),
    credits: integer("credits").notNull(),
    currency: text("currency").default("IDR").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    id: text("id").primaryKey(),
    mayarInvoiceId: text("mayar_invoice_id"),
    mayarTransactionId: text("mayar_transaction_id"),
    packId: text("pack_id").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    paymentUrl: text("payment_url"),
    reference: text("reference").notNull(),
    status: text("status", { enum: PURCHASE_STATUS })
      .default("pending")
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("credit_purchase_reference_unique").on(table.reference),
    uniqueIndex("credit_purchase_invoice_id_unique").on(table.mayarInvoiceId),
    uniqueIndex("credit_purchase_transaction_id_unique").on(
      table.mayarTransactionId
    ),
    index("credit_purchase_user_created_idx").on(table.userId, table.createdAt),
    // The reconciliation job scans by status and age.
    index("credit_purchase_status_created_idx").on(
      table.status,
      table.createdAt
    ),
  ]
);

export const webhookEvents = sqliteTable(
  "webhook_event",
  {
    attemptCount: integer("attempt_count").default(0).notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    errorMessage: text("error_message"),
    eventType: text("event_type").notNull(),
    id: text("id").primaryKey(),
    lockedUntil: integer("locked_until", { mode: "timestamp_ms" }),
    payload: text("payload", { mode: "json" }).$type<JsonObject>().notNull(),
    processedAt: integer("processed_at", { mode: "timestamp_ms" }),
    provider: text("provider").default("mayar").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    status: text("status", { enum: WEBHOOK_EVENT_STATUS })
      .default("received")
      .notNull(),
    transactionId: text("transaction_id"),
    ...timestamps,
  },
  (table) => [
    unique("webhook_provider_event_unique").on(
      table.provider,
      table.providerEventId
    ),
    uniqueIndex("webhook_transaction_id_unique").on(table.transactionId),
  ]
);

export const setupMetadata = sqliteTable(
  "setup_metadata",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    value: text("value", { mode: "json" }).$type<JsonObject>().notNull(),
    ...timestamps,
  },
  // One row per key. The constraint is what makes the setup claim a race the
  // database decides rather than the application. See ADR-0014.
  (table) => [uniqueIndex("setup_metadata_key_unique").on(table.key)]
);

export const authSchema = {
  account: accounts,
  session: sessions,
  user: users,
  verification: verifications,
};

export const schema = {
  ...authSchema,
  creditAccounts,
  creditEntries,
  creditPurchases,
  generationRequests,
  generations,
  setupMetadata,
  webhookEvents,
};
