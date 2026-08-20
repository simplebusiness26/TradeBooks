import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { companies, users } from './tenancy';
import { bankAccounts } from './core';

/**
 * One authorised Open Banking connection. Provider tokens/credentials are
 * never stored here: TrueLayer Data v3 uses our server-side client credential
 * plus this connection id to access the user's consented data.
 */
export const bankConnections = pgTable(
  'bank_connections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull().default('truelayer'),
    externalConnectionId: text('external_connection_id').notNull(),
    /** Random value embedded in the callback URL to bind a return to its initiation. */
    stateNonce: text('state_nonce').notNull(),
    status: text('status').notNull().default('authorization_required'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bank_connections_provider_external_unique').on(t.provider, t.externalConnectionId),
    uniqueIndex('bank_connections_state_unique').on(t.stateNonce),
    index('bank_connections_company_idx').on(t.companyId),
    index('bank_connections_company_status_idx').on(t.companyId, t.status),
  ],
);

/** Maps a TrueLayer connected account to the TradeBooks bank account it feeds. */
export const bankFeedAccounts = pgTable(
  'bank_feed_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => bankConnections.id, { onDelete: 'cascade' }),
    bankAccountId: uuid('bank_account_id')
      .notNull()
      .references(() => bankAccounts.id, { onDelete: 'cascade' }),
    externalAccountId: text('external_account_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('bank_feed_accounts_connection_external_unique').on(t.connectionId, t.externalAccountId),
    uniqueIndex('bank_feed_accounts_bank_account_unique').on(t.bankAccountId),
    index('bank_feed_accounts_company_idx').on(t.companyId),
  ],
);
