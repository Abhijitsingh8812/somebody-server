ALTER TABLE "messages" ADD COLUMN "audio_data" "bytea";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_mime_type" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_size_bytes" integer;