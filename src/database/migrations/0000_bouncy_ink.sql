DO $$ BEGIN
 CREATE TYPE "public"."message_type" AS ENUM('TEXT', 'VOICE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"unique_code" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_unique_code_unique" UNIQUE("unique_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text DEFAULT 'New User' NOT NULL,
	"avatar_url" text,
	"about" text,
	"preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"device_info" text,
	"revoked" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"last_message" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"message_type" "message_type" DEFAULT 'TEXT' NOT NULL,
	"content" text,
	"storage_object_key" text,
	"voice_duration" integer,
	"expires_at" timestamp with time zone DEFAULT (NOW() + INTERVAL '1 hour') NOT NULL,
	"expired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"storage_object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"mime_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "device_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"push_token" text NOT NULL,
	"platform" text DEFAULT 'android' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chats" ADD CONSTRAINT "chats_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "chats" ADD CONSTRAINT "chats_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chats"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "files" ADD CONSTRAINT "files_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_tokens" ADD CONSTRAINT "device_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_users_unique_code" ON "users" USING btree ("unique_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_profiles_user_id" ON "profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_user_id" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refresh_tokens_hash" ON "refresh_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_chats_user_a_user_b" ON "chats" USING btree ("user_a","user_b");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_chats_last_message_at" ON "chats" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_chat_created" ON "messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_expires_at" ON "messages" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_sender_id" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_files_owner_id" ON "files" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_device_tokens_user_id" ON "device_tokens" USING btree ("user_id");