import { pgEnum } from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('role', ['owner', 'admin', 'staff', 'reviewer']);

export const contactKindEnum = pgEnum('contact_kind', ['supplier', 'subcontractor', 'both']);

export const jobStatusEnum = pgEnum('job_status', [
  'quoted',
  'active',
  'on_hold',
  'completed',
  'invoiced',
  'closed',
  'cancelled',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'sent',
  'part_paid',
  'paid',
  'overdue',
  'void',
]);

export const billStatusEnum = pgEnum('bill_status', ['draft', 'awaiting_payment', 'part_paid', 'paid', 'void']);

export const transactionDirectionEnum = pgEnum('transaction_direction', ['money_in', 'money_out']);

export const transactionStatusEnum = pgEnum('transaction_status', [
  'needs_answer',
  'needs_receipt',
  'categorised',
  'reviewed',
  'excluded',
]);

export const reconciliationStatusEnum = pgEnum('reconciliation_status', [
  'unreconciled',
  'matched',
  'reconciled',
]);

export const categoryKindEnum = pgEnum('category_kind', ['income', 'expense', 'both']);

export const vatTreatmentEnum = pgEnum('vat_treatment', [
  'standard',
  'reduced',
  'zero',
  'exempt',
  'outside_scope',
  'reverse_charge',
  'no_vat',
]);

export const documentKindEnum = pgEnum('document_kind', [
  'receipt',
  'purchase_invoice',
  'sales_invoice',
  'statement',
  'certificate',
  'other',
]);

export const documentStatusEnum = pgEnum('document_status', [
  'uploaded',
  'processing',
  'extracted',
  'matched',
  'needs_answer',
  'filed',
  'failed',
]);

export const exceptionStatusEnum = pgEnum('exception_status', ['open', 'snoozed', 'resolved', 'dismissed']);

export const exceptionTypeEnum = pgEnum('exception_type', [
  'uncategorised_transaction',
  'missing_receipt',
  'ambiguous_receipt_match',
  'unmatched_receipt',
  'business_or_personal',
  'which_job',
  'unallocated_payment',
  'duplicate_suspected',
  'vat_treatment_unclear',
  'cis_details_missing',
  'other',
]);

export const decisionSourceEnum = pgEnum('decision_source', [
  'user',
  'rule',
  'history',
  'heuristic',
  'ai_suggestion',
  'import',
  'system',
]);

export const ruleMatchTypeEnum = pgEnum('rule_match_type', [
  'description_contains',
  'description_equals',
  'counterparty_equals',
  'reference_contains',
]);

export const periodStatusEnum = pgEnum('period_status', ['open', 'in_review', 'prepared', 'closed', 'filed']);

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
]);

export const cisStatusEnum = pgEnum('cis_status', ['unknown', 'gross', 'net_20', 'net_30']);

export const integrationKindEnum = pgEnum('integration_kind', [
  'bank_feed',
  'accounting',
  'ocr',
  'ai',
  'email',
  'storage',
  'hmrc',
]);

export const integrationStatusEnum = pgEnum('integration_status', [
  'not_configured',
  'configured',
  'connected',
  'error',
  'disabled',
]);
