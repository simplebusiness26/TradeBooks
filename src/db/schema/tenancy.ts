import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { roleEnum } from './enums';

export const companies = pgTable(
  'companies',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    tradingName: text('trading_name'),
    trade: text('trade').notNull().default('roofing'),
    companyNumber: text('company_number'),
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: text('city'),
    postcode: text('postcode'),
    country: text('country').notNull().default('GB'),
    phone: text('phone'),
    email: text('email'),
    currency: text('currency').notNull().default('GBP'),
    /** VAT settings */
    vatRegistered: boolean('vat_registered').notNull().default(false),
    vatNumber: text('vat_number'),
    vatScheme: text('vat_scheme').notNull().default('standard'),
    vatFlatRateBasisPoints: integer('vat_flat_rate_basis_points'),
    vatPeriodMonths: integer('vat_period_months').notNull().default(3),
    vatFirstPeriodEnd: text('vat_first_period_end'),
    /** CIS settings */
    cisContractor: boolean('cis_contractor').notNull().default(false),
    cisSubcontractor: boolean('cis_subcontractor').notNull().default(false),
    cisUtr: text('cis_utr'),
    /** Accounting period */
    financialYearEndMonth: integer('financial_year_end_month').notNull().default(3),
    financialYearEndDay: integer('financial_year_end_day').notNull().default(31),
    isDemo: boolean('is_demo').notNull().default(false),
    settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('companies_name_idx').on(t.name)],
);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    lastSignedInAt: timestamp('last_signed_in_at', { withTimezone: true }),
    failedSignInCount: integer('failed_sign_in_count').notNull().default(0),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_unique').on(t.email)],
);

export const memberships = pgTable(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull().default('staff'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('memberships_user_company_unique').on(t.userId, t.companyId),
    index('memberships_company_idx').on(t.companyId),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeCompanyId: uuid('active_company_id').references(() => companies.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
  },
  (t) => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)],
);

export const companiesRelations = relations(companies, ({ many }) => ({
  memberships: many(memberships),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(memberships),
  sessions: many(sessions),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  company: one(companies, { fields: [memberships.companyId], references: [companies.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));
