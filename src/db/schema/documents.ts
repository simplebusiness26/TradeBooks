import { relations } from 'drizzle-orm';
import {
  bigint,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { decisionSourceEnum, documentKindEnum, documentStatusEnum, vatTreatmentEnum } from './enums';
import { companies, users } from './tenancy';
import { suppliers } from './contacts';
import { categories, jobs } from './core';
import { transactions } from './banking';

export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: documentKindEnum('kind').notNull().default('receipt'),
    status: documentStatusEnum('status').notNull().default('uploaded'),

    /** Original file — never overwritten or discarded. */
    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    checksumSha256: text('checksum_sha256').notNull(),

    /** Extracted / confirmed values. Extraction never overwrites user input. */
    supplierId: uuid('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
    supplierNameText: text('supplier_name_text'),
    documentDate: date('document_date'),
    netPence: bigint('net_pence', { mode: 'number' }),
    vatPence: bigint('vat_pence', { mode: 'number' }),
    grossPence: bigint('gross_pence', { mode: 'number' }),
    vatTreatment: vatTreatmentEnum('vat_treatment'),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),

    /** Raw extraction output preserved verbatim for audit. */
    extractionProvider: text('extraction_provider'),
    extractionConfidence: integer('extraction_confidence'),
    extractionRaw: jsonb('extraction_raw').$type<Record<string, unknown>>(),
    extractedAt: timestamp('extracted_at', { withTimezone: true }),
    extractionError: text('extraction_error'),

    matchedTransactionId: uuid('matched_transaction_id').references(() => transactions.id, {
      onDelete: 'set null',
    }),
    matchSource: decisionSourceEnum('match_source'),
    matchConfidence: integer('match_confidence'),
    matchReason: text('match_reason'),
    matchedAt: timestamp('matched_at', { withTimezone: true }),

    notes: text('notes'),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('documents_company_status_idx').on(t.companyId, t.status),
    index('documents_transaction_idx').on(t.matchedTransactionId),
    index('documents_company_checksum_idx').on(t.companyId, t.checksumSha256),
    index('documents_job_idx').on(t.jobId),
  ],
);

export const documentsRelations = relations(documents, ({ one }) => ({
  supplier: one(suppliers, { fields: [documents.supplierId], references: [suppliers.id] }),
  transaction: one(transactions, {
    fields: [documents.matchedTransactionId],
    references: [transactions.id],
  }),
  job: one(jobs, { fields: [documents.jobId], references: [jobs.id] }),
  category: one(categories, { fields: [documents.categoryId], references: [categories.id] }),
}));
