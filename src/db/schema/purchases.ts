import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { billStatusEnum, vatTreatmentEnum } from './enums';
import { companies, users } from './tenancy';
import { suppliers } from './contacts';
import { categories, jobs } from './core';

export const bills = pgTable(
  'bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    /** Supplier's own document number. */
    reference: text('reference'),
    /** TradeBooks-side sequential number, unique per company. */
    number: text('number').notNull(),
    status: billStatusEnum('status').notNull().default('awaiting_payment'),
    billDate: date('bill_date').notNull(),
    dueDate: date('due_date').notNull(),
    description: text('description'),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    netPence: bigint('net_pence', { mode: 'number' }).notNull().default(0),
    vatPence: bigint('vat_pence', { mode: 'number' }).notNull().default(0),
    grossPence: bigint('gross_pence', { mode: 'number' }).notNull().default(0),
    paidPence: bigint('paid_pence', { mode: 'number' }).notNull().default(0),
    /** CIS: labour/materials split and deduction withheld from the subcontractor. */
    isSubcontractorPayment: boolean('is_subcontractor_payment').notNull().default(false),
    cisLabourPence: bigint('cis_labour_pence', { mode: 'number' }).notNull().default(0),
    cisMaterialsPence: bigint('cis_materials_pence', { mode: 'number' }).notNull().default(0),
    cisDeductionPence: bigint('cis_deduction_pence', { mode: 'number' }).notNull().default(0),
    cisDeductionRateBasisPoints: integer('cis_deduction_rate_basis_points'),
    cisPeriodId: uuid('cis_period_id'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bills_company_number_unique').on(t.companyId, t.number),
    index('bills_company_status_idx').on(t.companyId, t.status),
    index('bills_supplier_idx').on(t.supplierId),
    index('bills_job_idx').on(t.jobId),
    index('bills_cis_period_idx').on(t.cisPeriodId),
  ],
);

export const billLines = pgTable(
  'bill_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    billId: uuid('bill_id')
      .notNull()
      .references(() => bills.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    description: text('description').notNull(),
    quantityMilli: integer('quantity_milli').notNull().default(1000),
    unitPricePence: bigint('unit_price_pence', { mode: 'number' }).notNull().default(0),
    netPence: bigint('net_pence', { mode: 'number' }).notNull().default(0),
    vatTreatment: vatTreatmentEnum('vat_treatment').notNull().default('standard'),
    vatRateBasisPoints: integer('vat_rate_basis_points').notNull().default(2000),
    vatPence: bigint('vat_pence', { mode: 'number' }).notNull().default(0),
    grossPence: bigint('gross_pence', { mode: 'number' }).notNull().default(0),
    categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
    jobId: uuid('job_id').references(() => jobs.id, { onDelete: 'set null' }),
    isLabour: boolean('is_labour').notNull().default(false),
  },
  (t) => [index('bill_lines_bill_idx').on(t.billId), index('bill_lines_job_idx').on(t.jobId)],
);

export const billsRelations = relations(bills, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [bills.supplierId], references: [suppliers.id] }),
  job: one(jobs, { fields: [bills.jobId], references: [jobs.id] }),
  lines: many(billLines),
}));

export const billLinesRelations = relations(billLines, ({ one }) => ({
  bill: one(bills, { fields: [billLines.billId], references: [bills.id] }),
}));
