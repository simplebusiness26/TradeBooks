import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  decisionSourceEnum,
  reconciliationStatusEnum,
  transactionDirectionEnum,
  transactionStatusEnum,
  vatTreatmentEnum,
} from './enums';
import { companies, users } from './tenancy';
import { customers, suppliers } from './contacts';
import { bankAccounts, categories, jobs } from './core';

export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** csv_transactions | csv_customers | csv_suppliers | bank_feed | ... */
    kind: text('kind').notNull(),
    filename: text('filename'),
    bankAccountId: uuid('bank_account_id').references(() => bankAccounts.id, { onDelete: 'set null' }),
    rowCount: integer('row_count').notNull().default(0),
    importedCount: integer('imported_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    /** Hash of the uploaded payload; repeated uploads are detected, not duplicated. */
    contentHash: text('content_hash'),
    errors: jsonb('errors').$type<{ row: number; message: string }[]>().notNull().default([]),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('import_batches_company_idx').on(t.companyId),
    uniqueIndex('import_batches_company_hash_unique').on(t.companyId, t.contentHash),
  ],
);

export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'restrict' }),
    transactionDate: date('transaction_date').notNull(),
    direction: transactionDirectionEnum('direction').notNull(),
    /** Always positive; `direction` carries the sign. */
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),
    description: text('description').notNull(),
    /** Normalised counterparty text used by rules and history matching. */
    counterparty: text('counterparty'),
    reference: text('reference'),
    balanceAfterPence: bigint('balance_after_pence', { mode: 'number' }),

    status: transactionStatusEnum('status').notNull().default('needs_answer'),
    reconciliationStatus: reconciliationStatusEnum('reconciliation_status')
      .notNull()
      .default('unreconciled'),

    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),

    vatTreatment: vatTreatmentEnum('vat_treatment').notNull().default('standard'),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull().default(2000),
    netPence: bigint('net_pence', { mode: 'number' }),
    vatPence: bigint('vat_pence', { mode: 'number' }),

    isPersonal: boolean('is_personal').notNull().default(false),
    needsReceipt: boolean('needs_receipt').notNull().default(false),
    receiptRequiredThresholdMet: boolean('receipt_required_threshold_met').notNull().default(false),

    /** How the current categorisation was decided, and how confident we are. */
    categorySource: decisionSourceEnum('category_source').notNull().default('system'),
    categoryConfidence: integer('category_confidence'),
    categoryReason: text('category_reason'),
    appliedRuleId: uuid('applied_rule_id'),
    confirmedByUserId: uuid('confirmed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

    /** Provenance */
    source: decisionSourceEnum('source').notNull().default('user'),
    importBatchId: uuid('import_batch_id').references(() => importBatches.id, { onDelete: 'set null' }),
    externalId: text('external_id'),
    /** Stable hash of account+date+amount+description used for import idempotency. */
    dedupeHash: text('dedupe_hash').notNull(),
    rawPayload: jsonb('raw_payload').$type<Record<string, unknown>>(),

    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transactions_company_dedupe_unique').on(t.companyId, t.dedupeHash),
    index('transactions_company_date_idx').on(t.companyId, t.transactionDate),
    index('transactions_company_status_idx').on(t.companyId, t.status),
    index('transactions_account_idx').on(t.bankAccountId),
    index('transactions_supplier_idx').on(t.supplierId),
    index('transactions_job_idx').on(t.jobId),
  ],
);

/** Links a transaction to the bill/invoice/payment it settles. */
export const transactionLinks = pgTable(
  'transaction_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => transactions.id, { onDelete: 'cascade' }),
    /** bill | invoice | payment | document */
    linkedType: text('linked_type').notNull(),
    linkedId: uuid('linked_id').notNull(),
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),
    source: decisionSourceEnum('source').notNull().default('user'),
    confidence: integer('confidence'),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('transaction_links_unique').on(t.transactionId, t.linkedType, t.linkedId),
    index('transaction_links_linked_idx').on(t.linkedType, t.linkedId),
  ],
);

export const transactionsRelations = relations(transactions, ({ one, many }) => ({
  bankAccount: one(bankAccounts, {
    fields: [transactions.bankAccountId],
    references: [bankAccounts.id],
  }),
  category: one(categories, { fields: [transactions.categoryId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [transactions.supplierId], references: [suppliers.id] }),
  customer: one(customers, { fields: [transactions.customerId], references: [customers.id] }),
  job: one(jobs, { fields: [transactions.jobId], references: [jobs.id] }),
  links: many(transactionLinks),
}));

export const transactionLinksRelations = relations(transactionLinks, ({ one }) => ({
  transaction: one(transactions, {
    fields: [transactionLinks.transactionId],
    references: [transactions.id],
  }),
}));
