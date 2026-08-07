import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
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
export const PRODUCT_STATUS = ["active", "archived"] as const;
export const ORDER_STATUS = [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
] as const;
export const PAYMENT_STATUS = [
  "pending",
  "paid",
  "expired",
  "failed",
  "refunded",
] as const;
export const RESERVATION_STATUS = [
  "reserved",
  "converted",
  "released",
  "expired",
] as const;
export const PAYMENT_ATTEMPT_STATUS = [
  "created",
  "pending",
  "paid",
  "expired",
  "failed",
  "refunded",
] as const;
export const WEBHOOK_EVENT_STATUS = [
  "completed",
  "received",
  "processing",
  "processed",
  "ignored",
  "failed",
] as const;
export const REFUND_STATUS = ["pending", "completed", "failed"] as const;

export const users = sqliteTable(
  "user",
  {
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .default(false)
      .notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
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

export const categories = sqliteTable(
  "category",
  {
    description: text("description"),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("category_slug_unique").on(table.slug)]
);

export const products = sqliteTable(
  "product",
  {
    availableStock: integer("available_stock").default(0).notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    currency: text("currency").default("IDR").notNull(),
    description: text("description").notNull(),
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    price: integer("price").notNull(),
    reservedStock: integer("reserved_stock").default(0).notNull(),
    slug: text("slug").notNull(),
    status: text("status", { enum: PRODUCT_STATUS })
      .default("active")
      .notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_slug_unique").on(table.slug),
    index("product_category_id_idx").on(table.categoryId),
    index("product_status_idx").on(table.status),
    // This constraint is the oversell guard. A checkout that would take stock
    // below zero fails here, and D1 rolls back the whole batch. See ADR-0012.
    check(
      "product_available_stock_not_negative",
      sql`${table.availableStock} >= 0`
    ),
    check(
      "product_reserved_stock_not_negative",
      sql`${table.reservedStock} >= 0`
    ),
  ]
);

export const productImages = sqliteTable(
  "product_image",
  {
    alt: text("alt").notNull(),
    id: text("id").primaryKey(),
    // R2 object key, not a public address. See ADR-0013.
    objectKey: text("object_key").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("product_image_product_id_idx").on(table.productId)]
);

export const carts = sqliteTable(
  "cart",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [uniqueIndex("cart_user_id_unique").on(table.userId)]
);

export const cartItems = sqliteTable(
  "cart_item",
  {
    cartId: text("cart_id")
      .notNull()
      .references(() => carts.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    ...timestamps,
  },
  (table) => [
    unique("cart_product_unique").on(table.cartId, table.productId),
    index("cart_item_cart_id_idx").on(table.cartId),
  ]
);

export const orders = sqliteTable(
  "order",
  {
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    accessTokenHash: text("access_token_hash").notNull(),
    addressLine: text("address_line").notNull(),
    city: text("city").notNull(),
    currency: text("currency").default("IDR").notNull(),
    guestEmail: text("guest_email").notNull(),
    guestName: text("guest_name").notNull(),
    guestPhone: text("guest_phone").notNull(),
    id: text("id").primaryKey(),
    mayarInvoiceId: text("mayar_invoice_id"),
    mayarTransactionId: text("mayar_transaction_id"),
    orderNumber: text("order_number").notNull(),
    paidAt: integer("paid_at", { mode: "timestamp_ms" }),
    paymentStatus: text("payment_status", { enum: PAYMENT_STATUS })
      .default("pending")
      .notNull(),
    paymentUrl: text("payment_url"),
    postalCode: text("postal_code").notNull(),
    province: text("province").notNull(),
    reservationExpiresAt: integer("reservation_expires_at", {
      mode: "timestamp_ms",
    }).notNull(),
    shippingAmount: integer("shipping_amount").notNull(),
    status: text("status", { enum: ORDER_STATUS })
      .default("pending_payment")
      .notNull(),
    subtotal: integer("subtotal").notNull(),
    total: integer("total").notNull(),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("order_number_unique").on(table.orderNumber),
    uniqueIndex("order_access_token_hash_unique").on(table.accessTokenHash),
    index("order_user_id_idx").on(table.userId),
    index("order_status_idx").on(table.status),
    index("order_mayar_transaction_id_idx").on(table.mayarTransactionId),
    // The scheduled job scans by status and expiry. See ADR-0010.
    index("order_reservation_expiry_idx").on(
      table.status,
      table.reservationExpiresAt
    ),
  ]
);

export const orderItems = sqliteTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    // Frozen copy of the product image at purchase time, held as a key so that
    // a later domain change does not rewrite order history. See ADR-0013.
    imageObjectKey: text("image_object_key"),
    lineTotal: integer("line_total").notNull(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    productName: text("product_name").notNull(),
    productSlug: text("product_slug").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: integer("unit_price").notNull(),
    ...timestamps,
  },
  (table) => [index("order_item_order_id_idx").on(table.orderId)]
);

export const checkoutRequests = sqliteTable(
  "checkout_request",
  {
    fingerprint: text("fingerprint").notNull(),
    // The idempotency key the browser sends. A repeat violates this primary key,
    // which aborts the checkout batch and prevents a second order. See ADR-0003.
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("checkout_request_order_id_idx").on(table.orderId)]
);

export const inventoryReservations = sqliteTable(
  "inventory_reservation",
  {
    convertedAt: integer("converted_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    releasedAt: integer("released_at", { mode: "timestamp_ms" }),
    status: text("status", { enum: RESERVATION_STATUS })
      .default("reserved")
      .notNull(),
    ...timestamps,
  },
  (table) => [
    unique("reservation_order_product_unique").on(
      table.orderId,
      table.productId
    ),
    index("reservation_expiry_idx").on(table.status, table.expiresAt),
    index("reservation_order_id_idx").on(table.orderId),
  ]
);

export const paymentAttempts = sqliteTable(
  "payment_attempt",
  {
    amount: integer("amount").notNull(),
    currency: text("currency").default("IDR").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id"),
    metadata: text("metadata", { mode: "json" }).$type<JsonObject>(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentUrl: text("payment_url"),
    provider: text("provider").default("mayar").notNull(),
    status: text("status", { enum: PAYMENT_ATTEMPT_STATUS })
      .default("created")
      .notNull(),
    transactionId: text("transaction_id"),
    ...timestamps,
  },
  (table) => [
    index("payment_attempt_order_id_idx").on(table.orderId),
    uniqueIndex("payment_attempt_invoice_id_unique").on(table.invoiceId),
    uniqueIndex("payment_attempt_transaction_id_unique").on(
      table.transactionId
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
    index("webhook_transaction_id_idx").on(table.transactionId),
  ]
);

export const orderStatusHistory = sqliteTable(
  "order_status_history",
  {
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fromStatus: text("from_status"),
    id: text("id").primaryKey(),
    note: text("note"),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    toStatus: text("to_status").notNull(),
    ...timestamps,
  },
  (table) => [index("order_status_history_order_id_idx").on(table.orderId)]
);

export const refunds = sqliteTable(
  "refund",
  {
    amount: integer("amount").notNull(),
    externalId: text("external_id"),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    provider: text("provider").default("mayar").notNull(),
    reason: text("reason"),
    status: text("status", { enum: REFUND_STATUS })
      .default("pending")
      .notNull(),
    ...timestamps,
  },
  (table) => [index("refund_order_id_idx").on(table.orderId)]
);

export const setupMetadata = sqliteTable("setup_metadata", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  value: text("value", { mode: "json" }).$type<JsonObject>().notNull(),
  ...timestamps,
});

export const authSchema = {
  account: accounts,
  session: sessions,
  user: users,
  verification: verifications,
};

export const schema = {
  ...authSchema,
  cartItems,
  carts,
  categories,
  checkoutRequests,
  inventoryReservations,
  orderItems,
  orderStatusHistory,
  orders,
  paymentAttempts,
  productImages,
  products,
  refunds,
  setupMetadata,
  webhookEvents,
};
