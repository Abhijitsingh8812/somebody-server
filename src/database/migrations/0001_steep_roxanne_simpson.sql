DO $$ BEGIN
 CREATE TYPE "public"."connection_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requester_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"status" "connection_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "connections" ADD CONSTRAINT "connections_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_connections_pair" ON "connections" USING btree ("requester_id","recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_requester" ON "connections" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_recipient" ON "connections" USING btree ("recipient_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_connections_status" ON "connections" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_blocks_pair" ON "user_blocks" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocker" ON "user_blocks" USING btree ("blocker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_blocks_blocked" ON "user_blocks" USING btree ("blocked_id");