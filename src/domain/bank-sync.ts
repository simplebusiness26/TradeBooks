import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  bankAccounts,
  bankConnections,
  bankFeedAccounts,
  importBatches,
} from '@/db/schema';
import { getBankFeed } from '@/adapters/bank';
import { autoProcessTransaction, createTransaction } from '@/domain/transactions';
import type { IsoDate } from '@/lib/dates';

export async function linkBankConnection(input: {
  companyId: string;
  connectionRowId: string;
  externalConnectionId: string;
  userIp?: string | null;
}): Promise<number> {
  const feed = getBankFeed();
  const accounts = await feed.listAccounts(input.externalConnectionId, input.userIp);
  let linked = 0;

  for (const account of accounts) {
    const existing = await db
      .select({ id: bankAccounts.id })
      .from(bankAccounts)
      .where(
        and(
          eq(bankAccounts.companyId, input.companyId),
          eq(bankAccounts.feedProvider, 'truelayer'),
          eq(bankAccounts.feedExternalId, account.externalId),
        ),
      )
      .limit(1);

    let bankAccountId = existing[0]?.id;
    if (bankAccountId) {
      await db
        .update(bankAccounts)
        .set({
          name: account.name,
          accountType: account.accountType,
          sortCode: account.sortCode ?? null,
          accountNumberLast4: account.accountNumberLast4 ?? null,
          currency: account.currency,
          isArchived: false,
          updatedAt: new Date(),
        })
        .where(and(eq(bankAccounts.companyId, input.companyId), eq(bankAccounts.id, bankAccountId)));
    } else {
      const [created] = await db
        .insert(bankAccounts)
        .values({
          companyId: input.companyId,
          name: account.name,
          accountType: account.accountType,
          sortCode: account.sortCode ?? null,
          accountNumberLast4: account.accountNumberLast4 ?? null,
          currency: account.currency,
          feedProvider: 'truelayer',
          feedExternalId: account.externalId,
          openingBalancePence: 0,
        })
        .returning({ id: bankAccounts.id });
      bankAccountId = created?.id;
    }

    if (!bankAccountId) continue;
    await db
      .insert(bankFeedAccounts)
      .values({
        companyId: input.companyId,
        connectionId: input.connectionRowId,
        bankAccountId,
        externalAccountId: account.externalId,
      })
      .onConflictDoNothing();
    linked += 1;
  }

  await db
    .update(bankConnections)
    .set({ status: 'connected', updatedAt: new Date() })
    .where(
      and(
        eq(bankConnections.companyId, input.companyId),
        eq(bankConnections.id, input.connectionRowId),
      ),
    );
  return linked;
}

export async function syncBankConnection(input: {
  companyId: string;
  connectionRowId: string;
  externalConnectionId: string;
  userId?: string | null;
  userIp?: string | null;
}): Promise<{ imported: number; duplicates: number; errors: number }> {
  await linkBankConnection(input);

  const mappings = await db
    .select({
      bankAccountId: bankFeedAccounts.bankAccountId,
      externalAccountId: bankFeedAccounts.externalAccountId,
      lastSyncedAt: bankAccounts.feedLastSyncedAt,
    })
    .from(bankFeedAccounts)
    .innerJoin(bankAccounts, eq(bankAccounts.id, bankFeedAccounts.bankAccountId))
    .where(
      and(
        eq(bankFeedAccounts.companyId, input.companyId),
        eq(bankFeedAccounts.connectionId, input.connectionRowId),
      ),
    );

  let imported = 0;
  let duplicates = 0;
  let errors = 0;
  const feed = getBankFeed();
  const now = new Date();

  for (const mapping of mappings) {
    const from = syncFromDate(mapping.lastSyncedAt, now);
    const to = isoDate(now);
    let feedTransactions;
    try {
      feedTransactions = await feed.listTransactions(
        input.externalConnectionId,
        mapping.externalAccountId,
        from,
        to,
        input.userIp,
      );
    } catch (error) {
      errors += 1;
      console.error('Bank transaction sync failed', error);
      continue;
    }

    const [batch] = await db
      .insert(importBatches)
      .values({
        companyId: input.companyId,
        kind: 'bank_feed',
        filename: `TrueLayer ${from} to ${to}`,
        bankAccountId: mapping.bankAccountId,
        rowCount: feedTransactions.length,
        createdByUserId: input.userId ?? null,
      })
      .returning({ id: importBatches.id });

    let accountImported = 0;
    let accountDuplicates = 0;
    let accountErrors = 0;
    for (const transaction of feedTransactions) {
      try {
        const result = await createTransaction(db, {
          companyId: input.companyId,
          bankAccountId: mapping.bankAccountId,
          transactionDate: transaction.date as IsoDate,
          direction: transaction.amountPence < 0 ? 'money_out' : 'money_in',
          amountPence: Math.abs(transaction.amountPence),
          description: transaction.description,
          reference: transaction.reference ?? null,
          balanceAfterPence: transaction.balanceAfterPence ?? null,
          externalId: transaction.externalId,
          importBatchId: batch?.id ?? null,
          source: 'import',
          rawPayload: transaction.raw,
        });
        if (!result.created) {
          accountDuplicates += 1;
          continue;
        }
        accountImported += 1;
        try {
          await autoProcessTransaction(db, input.companyId, result.id);
        } catch (error) {
          // The transaction is still safely imported and visible in Ask Me.
          console.error('Automatic categorisation failed for bank transaction', error);
        }
      } catch (error) {
        accountErrors += 1;
        console.error('Could not import bank transaction', error);
      }
    }

    if (batch) {
      await db
        .update(importBatches)
        .set({
          importedCount: accountImported,
          duplicateCount: accountDuplicates,
          errorCount: accountErrors,
        })
        .where(eq(importBatches.id, batch.id));
    }

    await db
      .update(bankAccounts)
      .set({ feedLastSyncedAt: now, updatedAt: now })
      .where(and(eq(bankAccounts.companyId, input.companyId), eq(bankAccounts.id, mapping.bankAccountId)));

    imported += accountImported;
    duplicates += accountDuplicates;
    errors += accountErrors;
  }

  await db
    .update(bankConnections)
    .set({ status: errors > 0 ? 'connected_with_errors' : 'connected', lastSyncedAt: now, updatedAt: now })
    .where(
      and(
        eq(bankConnections.companyId, input.companyId),
        eq(bankConnections.id, input.connectionRowId),
      ),
    );

  return { imported, duplicates, errors };
}

function syncFromDate(lastSyncedAt: Date | null, now: Date): IsoDate {
  const start = lastSyncedAt ? new Date(lastSyncedAt) : new Date(now);
  start.setUTCDate(start.getUTCDate() - (lastSyncedAt ? 7 : 90));
  return isoDate(start);
}

function isoDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}
