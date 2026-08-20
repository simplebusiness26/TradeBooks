import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  decisionSourceEnum,
  exceptionStatusEnum,
  exceptionTypeEnum,
  ruleMatchTypeEnum,
  vatTreatmentEnum,
} from './enums';
import { companies, users } from './tenancy';
import { categories, jobs } from './core';
import { suppliers } from './contacts';

/** Deterministic, reusable categorisation rules learned from owner answers. */
export const rules = pgTable(
  'rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    matchType: ruleMatchTypeEnum('match_type').notNull().default('description_contains'),
    /** Lower-cased, whitespace-normalised match value. */
    matchValue: text('match_value').notNull(),
    /** money_in | money_out | any */
    appliesToDirection: text('applies_to_direction').notNull().default('any'),
    minAmountPence: bigint('min_amount_pence', { mode: 'number' }),
    maxAmountPence: bigint('max_amount_pence', { mode: 'number' }),

    setCategoryId: uuid('set_category_id').references(() => categories.id, { onDelete: 'cascade' }),
    setSupplierId: uuid('set_supplier_id').references(() => suppliers.id, { onDelete: 'cascade' }),
    setJobId: uuid('set_job_id').references(() => jobs.id, { onDelete: 'set null' }),
    setVatTreatment: vatTreatmentEnum('set_vat_treatment'),
    setIsPersonal: boolean('set_is_personal'),

    priority: integer('priority').notNull().default(100),
    isActive: boolean('is_active').notNull().default(true),
    /** Rules created by answering an Ask Me question record their origin. */
    createdFromExceptionId: uuid('created_from_exception_id'),
    source: decisionSourceEnum('source').notNull().default('user'),
    timesApplied: integer('times_applied').notNull().default(0),
    lastAppliedAt: timestamp('last_applied_at', { withTimezone: true }),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('rules_company_active_idx').on(t.companyId, t.isActive),
    index('rules_match_idx').on(t.companyId, t.matchType, t.matchValue),
  ],
);

/** The Ask Me queue: persisted, first-class exceptions. */
export const exceptions = pgTable(
  'exceptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    type: exceptionTypeEnum('type').notNull(),
    status: exceptionStatusEnum('status').notNull().default('open'),
    /** 1 = highest. Drives queue ordering. */
    priority: integer('priority').notNull().default(50),

    /** transaction | document | invoice | bill | payment | supplier | job */
    subjectType: text('subject_type').notNull(),
    subjectId: uuid('subject_id').notNull(),

    question: text('question').notNull(),
    detail: text('detail'),
    /** One-tap candidate answers offered to the owner. */
    candidates: jsonb('candidates')
      .$type<{ id: string; label: string; sublabel?: string; action: Record<string, unknown> }[]>()
      .notNull()
      .default([]),
    /** Stable key so the same question is never asked twice. */
    dedupeKey: text('dedupe_key').notNull(),

    resolutionAction: jsonb('resolution_action').$type<Record<string, unknown>>(),
    resolutionNote: text('resolution_note'),
    resolvedByUserId: uuid('resolved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    snoozedUntil: timestamp('snoozed_until', { withTimezone: true }),
    createdRuleId: uuid('created_rule_id').references(() => rules.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('exceptions_company_status_idx').on(t.companyId, t.status, t.priority),
    index('exceptions_subject_idx').on(t.subjectType, t.subjectId),
    index('exceptions_dedupe_idx').on(t.companyId, t.dedupeKey),
  ],
);

/** Append-only audit trail. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    /** e.g. transaction.categorised, invoice.sent, exception.resolved */
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    summary: text('summary').notNull(),
    /** Old/new values for changed fields, plus decision metadata. */
    changes: jsonb('changes').$type<Record<string, { from: unknown; to: unknown }>>(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    source: decisionSourceEnum('source').notNull().default('user'),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    actorLabel: text('actor_label'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_company_created_idx').on(t.companyId, t.createdAt),
    index('audit_events_entity_idx').on(t.entityType, t.entityId),
  ],
);

/** Outbound messages (reminders, notifications) recorded whatever the driver. */
export const outboxMessages = pgTable(
  'outbox_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull().default('email'),
    toAddress: text('to_address').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    /** invoice_reminder | missing_receipt | account | other */
    purpose: text('purpose').notNull().default('other'),
    relatedType: text('related_type'),
    relatedId: uuid('related_id'),
    status: text('status').notNull().default('queued'),
    provider: text('provider').notNull().default('log'),
    providerMessageId: text('provider_message_id'),
    error: text('error'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('outbox_company_idx').on(t.companyId, t.createdAt)],
);

export const rulesRelations = relations(rules, ({ one }) => ({
  category: one(categories, { fields: [rules.setCategoryId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [rules.setSupplierId], references: [suppliers.id] }),
}));

export const exceptionsRelations = relations(exceptions, ({ one }) => ({
  createdRule: one(rules, { fields: [exceptions.createdRuleId], references: [rules.id] }),
}));
