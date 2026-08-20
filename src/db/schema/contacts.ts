import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { cisStatusEnum, contactKindEnum } from './enums';
import { companies } from './tenancy';

export const customers = pgTable(
  'customers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    postcode: text('postcode'),
    notes: text('notes'),
    paymentTermsDays: integer('payment_terms_days').notNull().default(14),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('customers_company_idx').on(t.companyId),
    uniqueIndex('customers_company_name_unique').on(t.companyId, t.name),
  ],
);

export const suppliers = pgTable(
  'suppliers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: contactKindEnum('kind').notNull().default('supplier'),
    contactName: text('contact_name'),
    email: text('email'),
    phone: text('phone'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    postcode: text('postcode'),
    /** Default category applied to this supplier's spending. */
    defaultCategoryId: uuid('default_category_id'),
    vatNumber: text('vat_number'),
    notes: text('notes'),
    /** CIS / subcontractor details */
    isSubcontractor: boolean('is_subcontractor').notNull().default(false),
    utr: text('utr'),
    nationalInsuranceNumber: text('national_insurance_number'),
    cisStatus: cisStatusEnum('cis_status').notNull().default('unknown'),
    cisVerificationNumber: text('cis_verification_number'),
    cisVerifiedAt: timestamp('cis_verified_at', { withTimezone: true }),
    cisVerificationSource: text('cis_verification_source'),
    /** Bank details are stored for record-keeping only; TradeBooks never pays. */
    bankAccountName: text('bank_account_name'),
    bankSortCodeLast: text('bank_sort_code_last'),
    bankAccountLast4: text('bank_account_last4'),
    openingBalancePence: bigint('opening_balance_pence', { mode: 'number' }).notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('suppliers_company_idx').on(t.companyId),
    uniqueIndex('suppliers_company_name_unique').on(t.companyId, t.name),
  ],
);

export const customersRelations = relations(customers, ({ one }) => ({
  company: one(companies, { fields: [customers.companyId], references: [companies.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ one }) => ({
  company: one(companies, { fields: [suppliers.companyId], references: [companies.id] }),
}));
