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
import { integrationKindEnum, integrationStatusEnum, periodStatusEnum } from './enums';
import { companies, users } from './tenancy';
import { suppliers } from './contacts';

export const vatPeriods = pgTable(
  'vat_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** Human label, e.g. "Apr–Jun 2026". */
    label: text('label').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    dueDate: date('due_date'),
    status: periodStatusEnum('status').notNull().default('open'),

    /** Snapshot taken when the period is prepared. Estimates until then. */
    vatDueSalesPence: bigint('vat_due_sales_pence', { mode: 'number' }),
    vatReclaimedPence: bigint('vat_reclaimed_pence', { mode: 'number' }),
    netVatDuePence: bigint('net_vat_due_pence', { mode: 'number' }),
    totalSalesExVatPence: bigint('total_sales_ex_vat_pence', { mode: 'number' }),
    totalPurchasesExVatPence: bigint('total_purchases_ex_vat_pence', { mode: 'number' }),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),

    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    preparedByUserId: uuid('prepared_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** Filing happens outside TradeBooks in V1; recorded for the audit trail only. */
    filedAt: timestamp('filed_at', { withTimezone: true }),
    filedReference: text('filed_reference'),
    filedByUserId: uuid('filed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('vat_periods_company_range_unique').on(t.companyId, t.startDate, t.endDate)],
);

export const cisPeriods = pgTable(
  'cis_periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** CIS tax months run 6th to 5th. Label e.g. "6 May – 5 Jun 2026". */
    label: text('label').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    dueDate: date('due_date'),
    status: periodStatusEnum('status').notNull().default('open'),
    totalLabourPence: bigint('total_labour_pence', { mode: 'number' }),
    totalMaterialsPence: bigint('total_materials_pence', { mode: 'number' }),
    totalDeductionPence: bigint('total_deduction_pence', { mode: 'number' }),
    subcontractorCount: integer('subcontractor_count'),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>(),
    preparedAt: timestamp('prepared_at', { withTimezone: true }),
    preparedByUserId: uuid('prepared_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    filedAt: timestamp('filed_at', { withTimezone: true }),
    filedReference: text('filed_reference'),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cis_periods_company_range_unique').on(t.companyId, t.startDate, t.endDate)],
);

/** Per-subcontractor payment-and-deduction statement for a CIS period. */
export const cisStatements = pgTable(
  'cis_statements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    periodId: uuid('period_id')
      .notNull()
      .references(() => cisPeriods.id, { onDelete: 'cascade' }),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id, { onDelete: 'restrict' }),
    grossPaidPence: bigint('gross_paid_pence', { mode: 'number' }).notNull().default(0),
    materialsPence: bigint('materials_pence', { mode: 'number' }).notNull().default(0),
    labourPence: bigint('labour_pence', { mode: 'number' }).notNull().default(0),
    deductionRateBasisPoints: integer('deduction_rate_basis_points').notNull().default(2000),
    deductionPence: bigint('deduction_pence', { mode: 'number' }).notNull().default(0),
    netPaidPence: bigint('net_paid_pence', { mode: 'number' }).notNull().default(0),
    billIds: jsonb('bill_ids').$type<string[]>().notNull().default([]),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('cis_statements_period_supplier_unique').on(t.periodId, t.supplierId),
    index('cis_statements_company_idx').on(t.companyId),
  ],
);

/** Connection state for every optional external provider. */
export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    kind: integrationKindEnum('kind').notNull(),
    /** xero | quickbooks | freeagent | truelayer | anthropic | smtp | s3 ... */
    provider: text('provider').notNull(),
    status: integrationStatusEnum('status').notNull().default('not_configured'),
    displayName: text('display_name').notNull(),
    /** Never stores secrets; credentials live in environment configuration. */
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('integration_connections_company_provider_unique').on(t.companyId, t.provider)],
);

/** External-system ID mappings. External IDs are mappings, never identities. */
export const externalMappings = pgTable(
  'external_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    externalId: text('external_id').notNull(),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    payloadHash: text('payload_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('external_mappings_unique').on(t.companyId, t.provider, t.entityType, t.entityId),
    index('external_mappings_external_idx').on(t.companyId, t.provider, t.externalId),
  ],
);

export const cisStatementsRelations = relations(cisStatements, ({ one }) => ({
  period: one(cisPeriods, { fields: [cisStatements.periodId], references: [cisPeriods.id] }),
  supplier: one(suppliers, { fields: [cisStatements.supplierId], references: [suppliers.id] }),
}));
