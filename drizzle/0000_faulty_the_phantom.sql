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
CREATE TABLE `credit_account` (
	`balance` integer DEFAULT 0 NOT NULL,
	`user_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "credit_account_balance_not_negative" CHECK("credit_account"."balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE `credit_entry` (
	`delta` integer NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`idr_value` integer,
	`note` text,
	`reason` text NOT NULL,
	`ref_id` text NOT NULL,
	`ref_type` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `credit_entry_user_created_idx` ON `credit_entry` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_entry_ref_unique` ON `credit_entry` (`ref_type`,`ref_id`,`reason`);--> statement-breakpoint
CREATE TABLE `credit_purchase` (
	`amount` integer NOT NULL,
	`credited_at` integer,
	`credits` integer NOT NULL,
	`currency` text DEFAULT 'IDR' NOT NULL,
	`expires_at` integer,
	`id` text PRIMARY KEY NOT NULL,
	`mayar_invoice_id` text,
	`mayar_transaction_id` text,
	`pack_id` text NOT NULL,
	`paid_at` integer,
	`payment_url` text,
	`reference` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `credit_purchase_reference_unique` ON `credit_purchase` (`reference`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_purchase_invoice_id_unique` ON `credit_purchase` (`mayar_invoice_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `credit_purchase_transaction_id_unique` ON `credit_purchase` (`mayar_transaction_id`);--> statement-breakpoint
CREATE INDEX `credit_purchase_user_created_idx` ON `credit_purchase` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `credit_purchase_status_created_idx` ON `credit_purchase` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `generation_request` (
	`fingerprint` text NOT NULL,
	`generation_id` text NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`generation_id`) REFERENCES `generation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_request_generation_id_idx` ON `generation_request` (`generation_id`);--> statement-breakpoint
CREATE TABLE `generation` (
	`aspect_ratio` text NOT NULL,
	`completed_at` integer,
	`credit_cost` integer NOT NULL,
	`error_code` text,
	`error_message` text,
	`id` text PRIMARY KEY NOT NULL,
	`media_type` text,
	`model` text NOT NULL,
	`object_key` text,
	`prompt` text NOT NULL,
	`reference_keys` text DEFAULT '[]' NOT NULL,
	`refunded_at` integer,
	`resolution` text NOT NULL,
	`share_prompt_visible` integer DEFAULT true NOT NULL,
	`share_token` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`upstream_cost_usd` real,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `generation_user_created_idx` ON `generation` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `generation_status_created_idx` ON `generation` (`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_share_token_unique` ON `generation` (`share_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `generation_one_pending_per_user` ON `generation` (`user_id`) WHERE status = 'pending';--> statement-breakpoint
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
CREATE UNIQUE INDEX `setup_metadata_key_unique` ON `setup_metadata` (`key`);--> statement-breakpoint
CREATE TABLE `user` (
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`id` text PRIMARY KEY NOT NULL,
	`image` text,
	`mobile` text,
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
CREATE UNIQUE INDEX `webhook_provider_event_unique` ON `webhook_event` (`provider`,`provider_event_id`);