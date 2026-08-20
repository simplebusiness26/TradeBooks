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
import { accountTypeEnum, categoryKindEnum, jobStatusEnum, vatTreatmentEnum } from './enums';
import { companies, users } from './tenancy';
import { customers } from './contacts';

/**
 * Categories are the owner-facing plain-English buckets ("Materials",
 * "Fuel", "Scaffolding"). Each maps to a ledger account so the accountant
 * view and exports stay coherent.
 */
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Stable machine key for seeded/system categories. */
    code: text('code').notNull(),
    kind: categoryKindEnum('kind').notNull().default('expense'),
    description: text('description'),
    defaultVatTreatment: vatTreatmentEnum('default_vat_treatment').notNull().default('standard'),
    /** True for costs that count towards job material/labour cost. */
    isJobCost: boolean('is_job_cost').notNull().default(false),
    /** Cost group used for job profitability: materials | labour | other | none */
    jobCostGroup: text('job_cost_group').notNull().default('none'),
    isSystem: boolean('is_system').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    ledgerAccountCode: text('ledger_account_code'),
    sortOrder: integer('sort_order').notNull().default(100),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('categories_company_idx').on(t.companyId),
    uniqueIndex('categories_company_code_unique').on(t.companyId, t.code),
  ],
);

export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    reference: text('reference').notNull(),
    name: text('name').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    status: jobStatusEnum('status').notNull().default('quoted'),
    siteAddressLine1: text('site_address_line1'),
    siteCity: text('site_city'),
    sitePostcode: text('site_postcode'),
    description: text('description'),
    quotedRevenuePence: bigint('quoted_revenue_pence', { mode: 'number' }).notNull().default(0),
    estimatedCostPence: bigint('estimated_cost_pence', { mode: 'number' }).notNull().default(0),
    startDate: date('start_date'),
    endDate: date('end_date'),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('jobs_company_idx').on(t.companyId),
    uniqueIndex('jobs_company_reference_unique').on(t.companyId, t.reference),
    index('jobs_customer_idx').on(t.customerId),
  ],
);

export const bankAccounts = pgTable(
  'bank_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** current | savings | credit_card | cash */
    accountType: text('account_type').notNull().default('current'),
    sortCode: text('sort_code'),
    accountNumberLast4: text('account_number_last4'),
    openingBalancePence: bigint('opening_balance_pence', { mode: 'number' }).notNull().default(0),
    openingBalanceDate: date('opening_balance_date'),
    currency: text('currency').notNull().default('GBP'),
    /** Set when an open-banking feed is linked; null for manual/CSV accounts. */
    feedProvider: text('feed_provider'),
    feedExternalId: text('feed_external_id'),
    feedLastSyncedAt: timestamp('feed_last_synced_at', { withTimezone: true }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('bank_accounts_company_idx').on(t.companyId)],
);

/** Minimal chart of accounts backing the internal double-entry journal. */
export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: accountTypeEnum('type').notNull(),
    isSystem: boolean('is_system').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ledger_accounts_company_code_unique').on(t.companyId, t.code)],
);

export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entryDate: date('entry_date').notNull(),
    narrative: text('narrative').notNull(),
    /** Domain record that caused this posting, e.g. invoice / bill / transaction. */
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id'),
    /** Idempotency key so re-posting the same event cannot duplicate the journal. */
    postingKey: text('posting_key').notNull(),
    reversesEntryId: uuid('reverses_entry_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [
    uniqueIndex('journal_entries_posting_key_unique').on(t.companyId, t.postingKey),
    index('journal_entries_company_date_idx').on(t.companyId, t.entryDate),
    index('journal_entries_source_idx').on(t.sourceType, t.sourceId),
  ],
);

export const journalLines = pgTable(
  'journal_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    entryId: uuid('entry_id')
      .notNull()
      .references(() => journalEntries.id, { onDelete: 'cascade' }),
    accountCode: text('account_code').notNull(),
    /** Positive = debit, negative = credit. Lines of an entry always sum to 0. */
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    memo: text('memo'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('journal_lines_entry_idx').on(t.entryId),
    index('journal_lines_company_account_idx').on(t.companyId, t.accountCode),
    index('journal_lines_job_idx').on(t.jobId),
  ],
);

export const categoriesRelations = relations(categories, ({ one }) => ({
  company: one(companies, { fields: [categories.companyId], references: [companies.id] }),
}));

export const jobsRelations = relations(jobs, ({ one }) => ({
  company: one(companies, { fields: [jobs.companyId], references: [companies.id] }),
  customer: one(customers, { fields: [jobs.customerId], references: [customers.id] }),
}));

export const journalEntriesRelations = relations(journalEntries, ({ many }) => ({
  lines: many(journalLines),
}));

export const journalLinesRelations = relations(journalLines, ({ one }) => ({
  entry: one(journalEntries, { fields: [journalLines.entryId], references: [journalEntries.id] }),
}));
