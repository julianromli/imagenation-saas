CREATE TABLE `account` (
	`access_token` text,
	`access_token_expires_at` integer,
	`account_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`id_token` text,
	`password` text,
	`provider_id` text NOT NULL,
	`refresh_token` text,
	`refresh_token_expires_at` integer,
	`scope` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE TABLE `cart_item` (
	`cart_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`cart_id`) REFERENCES `cart`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `cart_item_cart_id_idx` ON `cart_item` (`cart_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `cart_product_unique` ON `cart_item` (`cart_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `cart` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cart_user_id_unique` ON `cart` (`user_id`);--> statement-breakpoint
CREATE TABLE `category` (
	`description` text,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `category_slug_unique` ON `category` (`slug`);--> statement-breakpoint
CREATE TABLE `checkout_request` (
	`id` text PRIMARY KEY NOT NULL,
	`fingerprint` text NOT NULL,
	`order_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `checkout_request_order_id_idx` ON `checkout_request` (`order_id`);--> statement-breakpoint
CREATE TABLE `inventory_reservation` (
	`converted_at` integer,
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`released_at` integer,
	`status` text DEFAULT 'reserved' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `reservation_expiry_idx` ON `inventory_reservation` (`status`,`expires_at`);--> statement-breakpoint
CREATE INDEX `reservation_order_id_idx` ON `inventory_reservation` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `reservation_order_product_unique` ON `inventory_reservation` (`order_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `order_item` (
	`id` text PRIMARY KEY NOT NULL,
	`image_object_key` text,
	`line_total` integer NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text,
	`product_name` text NOT NULL,
	`product_slug` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `order_item_order_id_idx` ON `order_item` (`order_id`);--> statement-breakpoint
CREATE TABLE `order_status_history` (
	`actor_user_id` text,
	`from_status` text,
	`id` text PRIMARY KEY NOT NULL,
	`note` text,
	`order_id` text NOT NULL,
	`to_status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `order_status_history_order_id_idx` ON `order_status_history` (`order_id`);--> statement-breakpoint
CREATE TABLE `order` (
	`access_token_expires_at` integer NOT NULL,
	`access_token_hash` text NOT NULL,
	`address_line` text NOT NULL,
	`city` text NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`guest_email` text NOT NULL,
	`guest_name` text NOT NULL,
	`guest_phone` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`mayar_invoice_id` text,
	`mayar_transaction_id` text,
	`order_number` text NOT NULL,
	`paid_at` integer,
	`payment_status` text DEFAULT 'pending' NOT NULL,
	`payment_url` text,
	`postal_code` text NOT NULL,
	`province` text NOT NULL,
	`reservation_expires_at` integer NOT NULL,
	`shipping_amount` integer NOT NULL,
	`status` text DEFAULT 'pending_payment' NOT NULL,
	`subtotal` integer NOT NULL,
	`total` integer NOT NULL,
	`user_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_number_unique` ON `order` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_access_token_hash_unique` ON `order` (`access_token_hash`);--> statement-breakpoint
CREATE INDEX `order_user_id_idx` ON `order` (`user_id`);--> statement-breakpoint
CREATE INDEX `order_status_idx` ON `order` (`status`);--> statement-breakpoint
CREATE INDEX `order_mayar_transaction_id_idx` ON `order` (`mayar_transaction_id`);--> statement-breakpoint
CREATE INDEX `order_reservation_expiry_idx` ON `order` (`status`,`reservation_expires_at`);--> statement-breakpoint
CREATE TABLE `payment_attempt` (
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`expires_at` integer,
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`metadata` text,
	`order_id` text NOT NULL,
	`payment_url` text,
	`provider` text DEFAULT 'mayar' NOT NULL,
	`status` text DEFAULT 'created' NOT NULL,
	`transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `payment_attempt_order_id_idx` ON `payment_attempt` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempt_invoice_id_unique` ON `payment_attempt` (`invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `payment_attempt_transaction_id_unique` ON `payment_attempt` (`transaction_id`);--> statement-breakpoint
CREATE TABLE `product_image` (
	`alt` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`object_key` text NOT NULL,
	`product_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `product_image_product_id_idx` ON `product_image` (`product_id`);--> statement-breakpoint
CREATE TABLE `product` (
	`available_stock` integer DEFAULT 0 NOT NULL,
	`category_id` text,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`description` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`price` integer NOT NULL,
	`reserved_stock` integer DEFAULT 0 NOT NULL,
	`slug` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "product_available_stock_not_negative" CHECK("product"."available_stock" >= 0),
	CONSTRAINT "product_reserved_stock_not_negative" CHECK("product"."reserved_stock" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_slug_unique` ON `product` (`slug`);--> statement-breakpoint
CREATE INDEX `product_category_id_idx` ON `product` (`category_id`);--> statement-breakpoint
CREATE INDEX `product_status_idx` ON `product` (`status`);--> statement-breakpoint
CREATE TABLE `refund` (
	`amount` integer NOT NULL,
	`external_id` text,
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`provider` text DEFAULT 'mayar' NOT NULL,
	`reason` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `order`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `refund_order_id_idx` ON `refund` (`order_id`);--> statement-breakpoint
CREATE TABLE `session` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`ip_address` text,
	`token` text NOT NULL,
	`user_agent` text,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE TABLE `setup_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image` text,
	`name` text NOT NULL,
	`role` text DEFAULT 'customer' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`expires_at` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `webhook_event` (
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	`error_message` text,
	`event_type` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`locked_until` integer,
	`payload` text NOT NULL,
	`processed_at` integer,
	`provider` text DEFAULT 'mayar' NOT NULL,
	`provider_event_id` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`transaction_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_transaction_id_unique` ON `webhook_event` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `webhook_transaction_id_idx` ON `webhook_event` (`transaction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_provider_event_unique` ON `webhook_event` (`provider`,`provider_event_id`);