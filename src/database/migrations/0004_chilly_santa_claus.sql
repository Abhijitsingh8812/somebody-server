ALTER TABLE "messages" ALTER COLUMN "expires_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "expires_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "expiration_minutes" integer;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_chat_read" ON "messages" USING btree ("chat_id","read_at");