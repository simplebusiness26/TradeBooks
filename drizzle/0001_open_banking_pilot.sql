CREATE TABLE IF NOT EXISTS "bank_connections" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "provider" text DEFAULT 'truelayer' NOT NULL,
  "external_connection_id" text NOT NULL,
  "state_nonce" text NOT NULL,
  "status" text DEFAULT 'authorization_required' NOT NULL,
  "created_by_user_id" uuid,
  "last_synced_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bank_feed_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "connection_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "external_account_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_connections" ADD CONSTRAINT "bank_connections_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_connection_id_bank_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."bank_connections"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bank_feed_accounts" ADD CONSTRAINT "bank_feed_accounts_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_provider_external_unique" ON "bank_connections" USING btree ("provider","external_connection_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_state_unique" ON "bank_connections" USING btree ("state_nonce");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_connections_company_idx" ON "bank_connections" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_connections_company_status_idx" ON "bank_connections" USING btree ("company_id","status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_feed_accounts_connection_external_unique" ON "bank_feed_accounts" USING btree ("connection_id","external_account_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bank_feed_accounts_bank_account_unique" ON "bank_feed_accounts" USING btree ("bank_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bank_feed_accounts_company_idx" ON "bank_feed_accounts" USING btree ("company_id");