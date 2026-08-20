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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { decisionSourceEnum, invoiceStatusEnum, vatTreatmentEnum } from './enums';
import { companies, users } from './tenancy';
import { customers } from './contacts';
import { categories, jobs } from './core';

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    number: text('number').notNull(),
    customerId: uuid('customer_id')
      .notNull()
      .references(() => customers.id, { onDelete: 'restrict' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    status: invoiceStatusEnum('status').notNull().default('draft'),
    issueDate: date('issue_date').notNull(),
    dueDate: date('due_date').notNull(),
    reference: text('reference'),
    notes: text('notes'),
    terms: text('terms'),
    netPence: bigint('net_pence', { mode: 'number' }).notNull().default(0),
    vatPence: bigint('vat_pence', { mode: 'number' }).notNull().default(0),
    grossPence: bigint('gross_pence', { mode: 'number' }).notNull().default(0),
    paidPence: bigint('paid_pence', { mode: 'number' }).notNull().default(0),
    /** CIS deduction withheld by the customer (when the company is a subcontractor). */
    cisDeductionPence: bigint('cis_deduction_pence', { mode: 'number' }).notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    lastReminderAt: timestamp('last_reminder_at', { withTimezone: true }),
    reminderCount: integer('reminder_count').notNull().default(0),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('invoices_company_number_unique').on(t.companyId, t.number),
    index('invoices_company_status_idx').on(t.companyId, t.status),
    index('invoices_customer_idx').on(t.customerId),
    index('invoices_job_idx').on(t.jobId),
  ],
);

export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    description: text('description').notNull(),
    /** Quantity in thousandths so 2.5 units is stored as 2500. */
    quantityMilli: integer('quantity_milli').notNull().default(1000),
    unitPricePence: bigint('unit_price_pence', { mode: 'number' }).notNull().default(0),
    netPence: bigint('net_pence', { mode: 'number' }).notNull().default(0),
    vatTreatment: vatTreatmentEnum('vat_treatment').notNull().default('standard'),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull().default(2000),
    vatPence: bigint('vat_pence', { mode: 'number' }).notNull().default(0),
    grossPence: bigint('gross_pence', { mode: 'number' }).notNull().default(0),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    /** Marks labour lines for CIS purposes when invoicing as a subcontractor. */
    isLabour: integer('is_labour').notNull().default(0),
  },
  (t) => [index('invoice_lines_invoice_idx').on(t.invoiceId)],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** 'customer_receipt' money in, or 'supplier_payment' money out. */
    direction: text('direction').notNull(),
    customerId: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
    supplierId: uuid('supplier_id'),
    paymentDate: date('payment_date').notNull(),
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),
    allocatedPence: bigint('allocated_pence', { mode: 'number' }).notNull().default(0),
    method: text('method').notNull().default('bank_transfer'),
    reference: text('reference'),
    notes: text('notes'),
    transactionId: uuid('transaction_id'),
    source: decisionSourceEnum('source').notNull().default('user'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payments_company_idx').on(t.companyId),
    index('payments_customer_idx').on(t.customerId),
    index('payments_transaction_idx').on(t.transactionId),
  ],
);

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
    billId: uuid('bill_id'),
    amountPence: bigint('amount_pence', { mode: 'number' }).notNull(),
    source: decisionSourceEnum('source').notNull().default('user'),
    confidence: integer('confidence'),
    reason: text('reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_allocations_payment_idx').on(t.paymentId),
    index('payment_allocations_invoice_idx').on(t.invoiceId),
    index('payment_allocations_bill_idx').on(t.billId),
  ],
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  customer: one(customers, { fields: [invoices.customerId], references: [customers.id] }),
  job: one(jobs, { fields: [invoices.jobId], references: [jobs.id] }),
  lines: many(invoiceLines),
  allocations: many(paymentAllocations),
}));

export const invoiceLinesRelations = relations(invoiceLines, ({ one }) => ({
  invoice: one(invoices, { fields: [invoiceLines.invoiceId], references: [invoices.id] }),
}));

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  customer: one(customers, { fields: [payments.customerId], references: [customers.id] }),
  allocations: many(paymentAllocations),
}));

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  invoice: one(invoices, { fields: [paymentAllocations.invoiceId], references: [invoices.id] }),
}));
