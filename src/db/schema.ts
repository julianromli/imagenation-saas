import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type JsonValue =
  | boolean
  | JsonObject
  | JsonValue[]
  | null
  | number
  | string;
export type JsonObject = { [key: string]: JsonValue };

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const productStatus = pgEnum("product_status", ["active", "archived"]);
export const orderStatus = pgEnum("order_status", [
  "pending_payment",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);
export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "paid",
  "expired",
  "failed",
  "refunded",
]);
export const reservationStatus = pgEnum("reservation_status", [
  "reserved",
  "converted",
  "released",
  "expired",
]);
export const paymentAttemptStatus = pgEnum("payment_attempt_status", [
  "created",
  "pending",
  "paid",
  "expired",
  "failed",
  "refunded",
]);
export const webhookEventStatus = pgEnum("webhook_event_status", [
  "completed",
  "received",
  "processing",
  "processed",
  "ignored",
  "failed",
]);
export const refundStatus = pgEnum("refund_status", [
  "pending",
  "completed",
  "failed",
]);

export const users = pgTable(
  "user",
  {
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    name: text("name").notNull(),
    role: text("role").default("customer").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("user_email_unique").on(table.email)]
);

export const sessions = pgTable(
  "session",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

export const accounts = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    accountId: text("account_id").notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [index("account_user_id_idx").on(table.userId)]
);

export const verifications = pgTable(
  "verification",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    ...timestamps,
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const categories = pgTable(
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

export const products = pgTable(
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
    status: productStatus("status").default("active").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("product_slug_unique").on(table.slug),
    index("product_category_id_idx").on(table.categoryId),
    index("product_status_idx").on(table.status),
  ]
);

export const productImages = pgTable(
  "product_image",
  {
    alt: text("alt").notNull(),
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    sortOrder: integer("sort_order").default(0).notNull(),
    url: text("url").notNull(),
    ...timestamps,
  },
  (table) => [index("product_image_product_id_idx").on(table.productId)]
);

export const carts = pgTable(
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

export const cartItems = pgTable(
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

export const orders = pgTable(
  "order",
  {
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
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
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paymentStatus: paymentStatus("payment_status").default("pending").notNull(),
    paymentUrl: text("payment_url"),
    postalCode: text("postal_code").notNull(),
    province: text("province").notNull(),
    reservationExpiresAt: timestamp("reservation_expires_at", {
      withTimezone: true,
    }).notNull(),
    shippingAmount: integer("shipping_amount").notNull(),
    status: orderStatus("status").default("pending_payment").notNull(),
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
  ]
);

export const orderItems = pgTable(
  "order_item",
  {
    id: text("id").primaryKey(),
    imageUrl: text("image_url"),
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

export const inventoryReservations = pgTable(
  "inventory_reservation",
  {
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    status: reservationStatus("status").default("reserved").notNull(),
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

export const paymentAttempts = pgTable(
  "payment_attempt",
  {
    amount: integer("amount").notNull(),
    currency: text("currency").default("IDR").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id"),
    metadata: jsonb("metadata").$type<JsonObject>(),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    paymentUrl: text("payment_url"),
    provider: text("provider").default("mayar").notNull(),
    status: paymentAttemptStatus("status").default("created").notNull(),
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

export const webhookEvents = pgTable(
  "webhook_event",
  {
    attemptCount: integer("attempt_count").default(0).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    eventType: text("event_type").notNull(),
    id: text("id").primaryKey(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    payload: jsonb("payload").$type<JsonObject>().notNull(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    provider: text("provider").default("mayar").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    status: webhookEventStatus("status").default("received").notNull(),
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

export const orderStatusHistory = pgTable(
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

export const refunds = pgTable(
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
    status: refundStatus("status").default("pending").notNull(),
    ...timestamps,
  },
  (table) => [index("refund_order_id_idx").on(table.orderId)]
);

export const rateLimitBuckets = pgTable(
  "rate_limit_bucket",
  {
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    requestCount: integer("request_count").default(0).notNull(),
    ...timestamps,
  },
  (table) => [index("rate_limit_bucket_expiry_idx").on(table.expiresAt)]
);

export const setupMetadata = pgTable("setup_metadata", {
  id: text("id").primaryKey(),
  key: text("key").notNull(),
  value: jsonb("value").$type<JsonObject>().notNull(),
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
  inventoryReservations,
  orderItems,
  orderStatusHistory,
  orders,
  paymentAttempts,
  productImages,
  products,
  rateLimitBuckets,
  refunds,
  setupMetadata,
  webhookEvents,
};
