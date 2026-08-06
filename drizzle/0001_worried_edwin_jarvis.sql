ALTER TYPE "public"."webhook_event_status" ADD VALUE 'completed' BEFORE 'received';--> statement-breakpoint
ALTER TYPE "public"."webhook_event_status" ADD VALUE 'processing' BEFORE 'processed';--> statement-breakpoint
ALTER TABLE "webhook_event" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD COLUMN "locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "webhook_event" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_transaction_id_unique" ON "webhook_event" USING btree ("transaction_id");