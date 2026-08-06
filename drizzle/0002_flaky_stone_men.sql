CREATE TYPE "public"."checkout_request_status" AS ENUM('processing', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "checkout_request" (
	"access_token_ciphertext" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"id" text PRIMARY KEY NOT NULL,
	"key_hash" text NOT NULL,
	"locked_until" timestamp with time zone,
	"order_id" text,
	"request_hash" text NOT NULL,
	"response_ciphertext" text,
	"status" "checkout_request_status" DEFAULT 'processing' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"expires_at" timestamp with time zone NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "payment_attempt" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "checkout_request" ADD CONSTRAINT "checkout_request_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checkout_request_key_unique" ON "checkout_request" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "checkout_request_status_idx" ON "checkout_request" USING btree ("status","locked_until");--> statement-breakpoint
CREATE INDEX "checkout_request_order_id_idx" ON "checkout_request" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_expiry_idx" ON "rate_limit_bucket" USING btree ("expires_at");