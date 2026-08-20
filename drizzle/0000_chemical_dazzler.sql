CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'equity', 'income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."bill_status" AS ENUM('draft', 'awaiting_payment', 'part_paid', 'paid', 'void');--> statement-breakpoint
CREATE TYPE "public"."category_kind" AS ENUM('income', 'expense', 'both');--> statement-breakpoint
CREATE TYPE "public"."cis_status" AS ENUM('unknown', 'gross', 'net_20', 'net_30');--> statement-breakpoint
CREATE TYPE "public"."contact_kind" AS ENUM('supplier', 'subcontractor', 'both');--> statement-breakpoint
CREATE TYPE "public"."decision_source" AS ENUM('user', 'rule', 'history', 'heuristic', 'ai_suggestion', 'import', 'system');--> statement-breakpoint
CREATE TYPE "public"."document_kind" AS ENUM('receipt', 'purchase_invoice', 'sales_invoice', 'statement', 'certificate', 'other');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'processing', 'extracted', 'matched', 'needs_answer', 'filed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."exception_status" AS ENUM('open', 'snoozed', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."exception_type" AS ENUM('uncategorised_transaction', 'missing_receipt', 'ambiguous_receipt_match', 'unmatched_receipt', 'business_or_personal', 'which_job', 'unallocated_payment', 'duplicate_suspected', 'vat_treatment_unclear', 'cis_details_missing', 'other');--> statement-breakpoint
CREATE TYPE "public"."integration_kind" AS ENUM('bank_feed', 'accounting', 'ocr', 'ai', 'email', 'storage', 'hmrc');--> statement-breakpoint
CREATE TYPE "public"."integration_status" AS ENUM('not_configured', 'configured', 'connected', 'error', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'part_paid', 'paid', 'overdue', 'void');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('quoted', 'active', 'on_hold', 'completed', 'invoiced', 'closed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."period_status" AS ENUM('open', 'in_review', 'prepared', 'closed', 'filed');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_status" AS ENUM('unreconciled', 'matched', 'reconciled');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'admin', 'staff', 'reviewer');--> statement-breakpoint
CREATE TYPE "public"."rule_match_type" AS ENUM('description_contains', 'description_equals', 'counterparty_equals', 'reference_contains');--> statement-breakpoint
CREATE TYPE "public"."transaction_direction" AS ENUM('money_in', 'money_out');--> statement-breakpoint
CREATE TYPE "public"."transaction_status" AS ENUM('needs_answer', 'needs_receipt', 'categorised', 'reviewed', 'excluded');--> statement-breakpoint
CREATE TYPE "public"."vat_treatment" AS ENUM('standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'no_vat');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"trading_name" text,
	"trade" text DEFAULT 'roofing' NOT NULL,
	"company_number" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postcode" text,
	"country" text DEFAULT 'GB' NOT NULL,
	"phone" text,
	"email" text,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"vat_registered" boolean DEFAULT false NOT NULL,
	"vat_number" text,
	"vat_scheme" text DEFAULT 'standard' NOT NULL,
	"vat_flat_rate_basis_points" integer,
	"vat_period_months" integer DEFAULT 3 NOT NULL,
	"vat_first_period_end" text,
	"cis_contractor" boolean DEFAULT false NOT NULL,
	"cis_subcontractor" boolean DEFAULT false NOT NULL,
	"cis_utr" text,
	"financial_year_end_month" integer DEFAULT 3 NOT NULL,
	"financial_year_end_day" integer DEFAULT 31 NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "role" DEFAULT 'staff' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"active_company_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"ip_address" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	"failed_sign_in_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postcode" text,
	"notes" text,
	"payment_terms_days" integer DEFAULT 14 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "contact_kind" DEFAULT 'supplier' NOT NULL,
	"contact_name" text,
	"email" text,
	"phone" text,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"postcode" text,
	"default_category_id" uuid,
	"vat_number" text,
	"notes" text,
	"is_subcontractor" boolean DEFAULT false NOT NULL,
	"utr" text,
	"national_insurance_number" text,
	"cis_status" "cis_status" DEFAULT 'unknown' NOT NULL,
	"cis_verification_number" text,
	"cis_verified_at" timestamp with time zone,
	"cis_verification_source" text,
	"bank_account_name" text,
	"bank_sort_code_last" text,
	"bank_account_last4" text,
	"opening_balance_pence" bigint DEFAULT 0 NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_type" text DEFAULT 'current' NOT NULL,
	"sort_code" text,
	"account_number_last4" text,
	"opening_balance_pence" bigint DEFAULT 0 NOT NULL,
	"opening_balance_date" date,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"feed_provider" text,
	"feed_external_id" text,
	"feed_last_synced_at" timestamp with time zone,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"kind" "category_kind" DEFAULT 'expense' NOT NULL,
	"description" text,
	"default_vat_treatment" "vat_treatment" DEFAULT 'standard' NOT NULL,
	"is_job_cost" boolean DEFAULT false NOT NULL,
	"job_cost_group" text DEFAULT 'none' NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"ledger_account_code" text,
	"sort_order" integer DEFAULT 100 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"name" text NOT NULL,
	"customer_id" uuid,
	"status" "job_status" DEFAULT 'quoted' NOT NULL,
	"site_address_line1" text,
	"site_city" text,
	"site_postcode" text,
	"description" text,
	"quoted_revenue_pence" bigint DEFAULT 0 NOT NULL,
	"estimated_cost_pence" bigint DEFAULT 0 NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entry_date" date NOT NULL,
	"narrative" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" uuid,
	"posting_key" text NOT NULL,
	"reverses_entry_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" uuid
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"account_code" text NOT NULL,
	"amount_pence" bigint NOT NULL,
	"job_id" uuid,
	"category_id" uuid,
	"memo" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"type" "account_type" NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity_milli" integer DEFAULT 1000 NOT NULL,
	"unit_price_pence" bigint DEFAULT 0 NOT NULL,
	"net_pence" bigint DEFAULT 0 NOT NULL,
	"vat_treatment" "vat_treatment" DEFAULT 'standard' NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"vat_pence" bigint DEFAULT 0 NOT NULL,
	"gross_pence" bigint DEFAULT 0 NOT NULL,
	"category_id" uuid,
	"job_id" uuid,
	"is_labour" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"number" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"job_id" uuid,
	"status" "invoice_status" DEFAULT 'draft' NOT NULL,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"reference" text,
	"notes" text,
	"terms" text,
	"net_pence" bigint DEFAULT 0 NOT NULL,
	"vat_pence" bigint DEFAULT 0 NOT NULL,
	"gross_pence" bigint DEFAULT 0 NOT NULL,
	"paid_pence" bigint DEFAULT 0 NOT NULL,
	"cis_deduction_pence" bigint DEFAULT 0 NOT NULL,
	"sent_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"last_reminder_at" timestamp with time zone,
	"reminder_count" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid,
	"bill_id" uuid,
	"amount_pence" bigint NOT NULL,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"confidence" integer,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"customer_id" uuid,
	"supplier_id" uuid,
	"payment_date" date NOT NULL,
	"amount_pence" bigint NOT NULL,
	"allocated_pence" bigint DEFAULT 0 NOT NULL,
	"method" text DEFAULT 'bank_transfer' NOT NULL,
	"reference" text,
	"notes" text,
	"transaction_id" uuid,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bill_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bill_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"description" text NOT NULL,
	"quantity_milli" integer DEFAULT 1000 NOT NULL,
	"unit_price_pence" bigint DEFAULT 0 NOT NULL,
	"net_pence" bigint DEFAULT 0 NOT NULL,
	"vat_treatment" "vat_treatment" DEFAULT 'standard' NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"vat_pence" bigint DEFAULT 0 NOT NULL,
	"gross_pence" bigint DEFAULT 0 NOT NULL,
	"category_id" uuid,
	"job_id" uuid,
	"is_labour" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"reference" text,
	"number" text NOT NULL,
	"status" "bill_status" DEFAULT 'awaiting_payment' NOT NULL,
	"bill_date" date NOT NULL,
	"due_date" date NOT NULL,
	"description" text,
	"job_id" uuid,
	"net_pence" bigint DEFAULT 0 NOT NULL,
	"vat_pence" bigint DEFAULT 0 NOT NULL,
	"gross_pence" bigint DEFAULT 0 NOT NULL,
	"paid_pence" bigint DEFAULT 0 NOT NULL,
	"is_subcontractor_payment" boolean DEFAULT false NOT NULL,
	"cis_labour_pence" bigint DEFAULT 0 NOT NULL,
	"cis_materials_pence" bigint DEFAULT 0 NOT NULL,
	"cis_deduction_pence" bigint DEFAULT 0 NOT NULL,
	"cis_deduction_rate_basis_points" integer,
	"cis_period_id" uuid,
	"paid_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"filename" text,
	"bank_account_id" uuid,
	"row_count" integer DEFAULT 0 NOT NULL,
	"imported_count" integer DEFAULT 0 NOT NULL,
	"duplicate_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"content_hash" text,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"linked_type" text NOT NULL,
	"linked_id" uuid NOT NULL,
	"amount_pence" bigint NOT NULL,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"confidence" integer,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"bank_account_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"direction" "transaction_direction" NOT NULL,
	"amount_pence" bigint NOT NULL,
	"description" text NOT NULL,
	"counterparty" text,
	"reference" text,
	"balance_after_pence" bigint,
	"status" "transaction_status" DEFAULT 'needs_answer' NOT NULL,
	"reconciliation_status" "reconciliation_status" DEFAULT 'unreconciled' NOT NULL,
	"category_id" uuid,
	"supplier_id" uuid,
	"customer_id" uuid,
	"job_id" uuid,
	"vat_treatment" "vat_treatment" DEFAULT 'standard' NOT NULL,
	"vat_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"net_pence" bigint,
	"vat_pence" bigint,
	"is_personal" boolean DEFAULT false NOT NULL,
	"needs_receipt" boolean DEFAULT false NOT NULL,
	"receipt_required_threshold_met" boolean DEFAULT false NOT NULL,
	"category_source" "decision_source" DEFAULT 'system' NOT NULL,
	"category_confidence" integer,
	"category_reason" text,
	"applied_rule_id" uuid,
	"confirmed_by_user_id" uuid,
	"confirmed_at" timestamp with time zone,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"import_batch_id" uuid,
	"external_id" text,
	"dedupe_hash" text NOT NULL,
	"raw_payload" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "document_kind" DEFAULT 'receipt' NOT NULL,
	"status" "document_status" DEFAULT 'uploaded' NOT NULL,
	"storage_key" text NOT NULL,
	"original_filename" text NOT NULL,
	"content_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"checksum_sha256" text NOT NULL,
	"supplier_id" uuid,
	"supplier_name_text" text,
	"document_date" date,
	"net_pence" bigint,
	"vat_pence" bigint,
	"gross_pence" bigint,
	"vat_treatment" "vat_treatment",
	"category_id" uuid,
	"job_id" uuid,
	"extraction_provider" text,
	"extraction_confidence" integer,
	"extraction_raw" jsonb,
	"extracted_at" timestamp with time zone,
	"extraction_error" text,
	"matched_transaction_id" uuid,
	"match_source" "decision_source",
	"match_confidence" integer,
	"match_reason" text,
	"matched_at" timestamp with time zone,
	"notes" text,
	"uploaded_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid,
	"summary" text NOT NULL,
	"changes" jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"actor_user_id" uuid,
	"actor_label" text,
	"ip_address" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exceptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"type" "exception_type" NOT NULL,
	"status" "exception_status" DEFAULT 'open' NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"question" text NOT NULL,
	"detail" text,
	"candidates" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dedupe_key" text NOT NULL,
	"resolution_action" jsonb,
	"resolution_note" text,
	"resolved_by_user_id" uuid,
	"resolved_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"created_rule_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"purpose" text DEFAULT 'other' NOT NULL,
	"related_type" text,
	"related_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"provider" text DEFAULT 'log' NOT NULL,
	"provider_message_id" text,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"match_type" "rule_match_type" DEFAULT 'description_contains' NOT NULL,
	"match_value" text NOT NULL,
	"applies_to_direction" text DEFAULT 'any' NOT NULL,
	"min_amount_pence" bigint,
	"max_amount_pence" bigint,
	"set_category_id" uuid,
	"set_supplier_id" uuid,
	"set_job_id" uuid,
	"set_vat_treatment" "vat_treatment",
	"set_is_personal" boolean,
	"priority" integer DEFAULT 100 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_from_exception_id" uuid,
	"source" "decision_source" DEFAULT 'user' NOT NULL,
	"times_applied" integer DEFAULT 0 NOT NULL,
	"last_applied_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cis_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"due_date" date,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"total_labour_pence" bigint,
	"total_materials_pence" bigint,
	"total_deduction_pence" bigint,
	"subcontractor_count" integer,
	"snapshot" jsonb,
	"prepared_at" timestamp with time zone,
	"prepared_by_user_id" uuid,
	"filed_at" timestamp with time zone,
	"filed_reference" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cis_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"gross_paid_pence" bigint DEFAULT 0 NOT NULL,
	"materials_pence" bigint DEFAULT 0 NOT NULL,
	"labour_pence" bigint DEFAULT 0 NOT NULL,
	"deduction_rate_basis_points" integer DEFAULT 2000 NOT NULL,
	"deduction_pence" bigint DEFAULT 0 NOT NULL,
	"net_paid_pence" bigint DEFAULT 0 NOT NULL,
	"bill_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_synced_at" timestamp with time zone,
	"payload_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "integration_kind" NOT NULL,
	"provider" text NOT NULL,
	"status" "integration_status" DEFAULT 'not_configured' NOT NULL,
	"display_name" text NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vat_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"label" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"due_date" date,
	"status" "period_status" DEFAULT 'open' NOT NULL,
	"vat_due_sales_pence" bigint,
	"vat_reclaimed_pence" bigint,
	"net_vat_due_pence" bigint,
	"total_sales_ex_vat_pence" bigint,
	"total_purchases_ex_vat_pence" bigint,
	"snapshot" jsonb,
	"prepared_at" timestamp with time zone,
	"prepared_by_user_id" uuid,
	"filed_at" timestamp with time zone,
	"filed_reference" text,
	"filed_by_user_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_active_company_id_companies_id_fk" FOREIGN KEY ("active_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_lines" ADD CONSTRAINT "invoice_lines_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_bills_id_fk" FOREIGN KEY ("bill_id") REFERENCES "public"."bills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_links" ADD CONSTRAINT "transaction_links_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_matched_transaction_id_transactions_id_fk" FOREIGN KEY ("matched_transaction_id") REFERENCES "public"."transactions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exceptions" ADD CONSTRAINT "exceptions_created_rule_id_rules_id_fk" FOREIGN KEY ("created_rule_id") REFERENCES "public"."rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_set_category_id_categories_id_fk" FOREIGN KEY ("set_category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_set_supplier_id_suppliers_id_fk" FOREIGN KEY ("set_supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_set_job_id_jobs_id_fk" FOREIGN KEY ("set_job_id") REFERENCES "public"."jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rules" ADD CONSTRAINT "rules_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cis_periods" ADD CONSTRAINT "cis_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cis_periods" ADD CONSTRAINT "cis_periods_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cis_statements" ADD CONSTRAINT "cis_statements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cis_statements" ADD CONSTRAINT "cis_statements_period_id_cis_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."cis_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cis_statements" ADD CONSTRAINT "cis_statements_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_mappings" ADD CONSTRAINT "external_mappings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_periods" ADD CONSTRAINT "vat_periods_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_periods" ADD CONSTRAINT "vat_periods_prepared_by_user_id_users_id_fk" FOREIGN KEY ("prepared_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vat_periods" ADD CONSTRAINT "vat_periods_filed_by_user_id_users_id_fk" FOREIGN KEY ("filed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_name_idx" ON "companies" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_company_unique" ON "memberships" USING btree ("user_id","company_id");--> statement-breakpoint
CREATE INDEX "memberships_company_idx" ON "memberships" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "customers_company_idx" ON "customers" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_company_name_unique" ON "customers" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "suppliers_company_idx" ON "suppliers" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_company_name_unique" ON "suppliers" USING btree ("company_id","name");--> statement-breakpoint
CREATE INDEX "bank_accounts_company_idx" ON "bank_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "categories_company_idx" ON "categories" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_company_code_unique" ON "categories" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "jobs_company_idx" ON "jobs" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_company_reference_unique" ON "jobs" USING btree ("company_id","reference");--> statement-breakpoint
CREATE INDEX "jobs_customer_idx" ON "jobs" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "journal_entries_posting_key_unique" ON "journal_entries" USING btree ("company_id","posting_key");--> statement-breakpoint
CREATE INDEX "journal_entries_company_date_idx" ON "journal_entries" USING btree ("company_id","entry_date");--> statement-breakpoint
CREATE INDEX "journal_entries_source_idx" ON "journal_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry_idx" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "journal_lines_company_account_idx" ON "journal_lines" USING btree ("company_id","account_code");--> statement-breakpoint
CREATE INDEX "journal_lines_job_idx" ON "journal_lines" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_accounts_company_code_unique" ON "ledger_accounts" USING btree ("company_id","code");--> statement-breakpoint
CREATE INDEX "invoice_lines_invoice_idx" ON "invoice_lines" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_company_number_unique" ON "invoices" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "invoices_company_status_idx" ON "invoices" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "invoices_customer_idx" ON "invoices" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "invoices_job_idx" ON "invoices" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_bill_idx" ON "payment_allocations" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "payments_company_idx" ON "payments" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "payments_customer_idx" ON "payments" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "payments_transaction_idx" ON "payments" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "bill_lines_bill_idx" ON "bill_lines" USING btree ("bill_id");--> statement-breakpoint
CREATE INDEX "bill_lines_job_idx" ON "bill_lines" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bills_company_number_unique" ON "bills" USING btree ("company_id","number");--> statement-breakpoint
CREATE INDEX "bills_company_status_idx" ON "bills" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "bills_supplier_idx" ON "bills" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "bills_job_idx" ON "bills" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "bills_cis_period_idx" ON "bills" USING btree ("cis_period_id");--> statement-breakpoint
CREATE INDEX "import_batches_company_idx" ON "import_batches" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "import_batches_company_hash_unique" ON "import_batches" USING btree ("company_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_links_unique" ON "transaction_links" USING btree ("transaction_id","linked_type","linked_id");--> statement-breakpoint
CREATE INDEX "transaction_links_linked_idx" ON "transaction_links" USING btree ("linked_type","linked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transactions_company_dedupe_unique" ON "transactions" USING btree ("company_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "transactions_company_date_idx" ON "transactions" USING btree ("company_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_company_status_idx" ON "transactions" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "transactions_account_idx" ON "transactions" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "transactions_supplier_idx" ON "transactions" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "transactions_job_idx" ON "transactions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "documents_company_status_idx" ON "documents" USING btree ("company_id","status");--> statement-breakpoint
CREATE INDEX "documents_transaction_idx" ON "documents" USING btree ("matched_transaction_id");--> statement-breakpoint
CREATE INDEX "documents_company_checksum_idx" ON "documents" USING btree ("company_id","checksum_sha256");--> statement-breakpoint
CREATE INDEX "documents_job_idx" ON "documents" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "audit_events_company_created_idx" ON "audit_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_entity_idx" ON "audit_events" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "exceptions_company_status_idx" ON "exceptions" USING btree ("company_id","status","priority");--> statement-breakpoint
CREATE INDEX "exceptions_subject_idx" ON "exceptions" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "exceptions_dedupe_idx" ON "exceptions" USING btree ("company_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "outbox_company_idx" ON "outbox_messages" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "rules_company_active_idx" ON "rules" USING btree ("company_id","is_active");--> statement-breakpoint
CREATE INDEX "rules_match_idx" ON "rules" USING btree ("company_id","match_type","match_value");--> statement-breakpoint
CREATE UNIQUE INDEX "cis_periods_company_range_unique" ON "cis_periods" USING btree ("company_id","start_date","end_date");--> statement-breakpoint
CREATE UNIQUE INDEX "cis_statements_period_supplier_unique" ON "cis_statements" USING btree ("period_id","supplier_id");--> statement-breakpoint
CREATE INDEX "cis_statements_company_idx" ON "cis_statements" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_mappings_unique" ON "external_mappings" USING btree ("company_id","provider","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "external_mappings_external_idx" ON "external_mappings" USING btree ("company_id","provider","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_connections_company_provider_unique" ON "integration_connections" USING btree ("company_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "vat_periods_company_range_unique" ON "vat_periods" USING btree ("company_id","start_date","end_date");