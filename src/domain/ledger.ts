import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { journalEntries, journalLines, ledgerAccounts } from '@/db/schema';
import { AppError } from '@/lib/errors';
import type { Pence } from '@/lib/money';
import type { IsoDate } from '@/lib/dates';

/**
 * TradeBooks keeps its own double-entry journal alongside the operational
 * records. It is derived automatically — the owner never sees it — but it
 * gives the accountant workspace a real trial balance and makes data
 * integrity checkable rather than assumed.
 */
export const ACCOUNTS = {
  BANK: { code: '1200', name: 'Bank and cash', type: 'asset' },
  DEBTORS: { code: '1100', name: 'Money owed to us (debtors)', type: 'asset' },
  CREDITORS: { code: '2100', name: 'Money we owe (creditors)', type: 'liability' },
  VAT_CONTROL: { code: '2200', name: 'VAT control', type: 'liability' },
  CIS_CONTROL: { code: '2210', name: 'CIS deductions payable', type: 'liability' },
  SUSPENSE: { code: '9999', name: 'Suspense — needs review', type: 'asset' },
  DRAWINGS: { code: '3100', name: 'Personal / drawings', type: 'equity' },
  SALES: { code: '4000', name: 'Sales', type: 'income' },
  COST_MATERIALS: { code: '5000', name: 'Materials', type: 'expense' },
  COST_LABOUR: { code: '5100', name: 'Subcontractors and labour', type: 'expense' },
  COST_OTHER: { code: '5200', name: 'Other job costs', type: 'expense' },
  OVERHEADS: { code: '6000', name: 'Overheads', type: 'expense' },
} as const;

export const SYSTEM_ACCOUNTS = Object.values(ACCOUNTS);

export type JournalLineInput = {
  accountCode: string;
  /** Positive debit, negative credit. */
  amountPence: Pence;
  jobId?: string | null;
  categoryId?: string | null;
  memo?: string | null;
  metadata?: Record<string, unknown>;
};

export type PostEntryInput = {
  companyId: string;
  entryDate: IsoDate;
  narrative: string;
  sourceType: string;
  sourceId?: string | null;
  /** Idempotency key — posting the same key twice replaces the earlier entry. */
  postingKey: string;
  lines: JournalLineInput[];
  createdByUserId?: string | null;
};

export class LedgerError extends AppError {
  constructor(message: string) {
    super(message, { status: 500, code: 'ledger_error' });
  }
}

/**
 * Posts a balanced journal entry. Re-posting the same `postingKey` replaces
 * the previous entry so that editing a source record keeps the journal in
 * step without ever duplicating it.
 */
export async function postEntry(db: Database, input: PostEntryInput): Promise<string | null> {
  const lines = input.lines.filter((l) => l.amountPence !== 0);
  if (lines.length === 0) {
    await removeEntry(db, input.companyId, input.postingKey);
    return null;
  }

  const total = lines.reduce((sum, l) => sum + l.amountPence, 0);
  if (total !== 0) {
    throw new LedgerError(
      `Journal entry "${input.narrative}" does not balance (out by ${total} pence)`,
    );
  }

  await removeEntry(db, input.companyId, input.postingKey);

  const [entry] = await db
    .insert(journalEntries)
    .values({
      companyId: input.companyId,
      entryDate: input.entryDate,
      narrative: input.narrative,
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      postingKey: input.postingKey,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning({ id: journalEntries.id });

  if (!entry) throw new LedgerError('Failed to create journal entry');

  await db.insert(journalLines).values(
    lines.map((line) => ({
      companyId: input.companyId,
      entryId: entry.id,
      accountCode: line.accountCode,
      amountPence: line.amountPence,
      jobId: line.jobId ?? null,
      categoryId: line.categoryId ?? null,
      memo: line.memo ?? null,
      metadata: line.metadata ?? {},
    })),
  );

  return entry.id;
}

export async function removeEntry(db: Database, companyId: string, postingKey: string): Promise<void> {
  const existing = await db
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(eq(journalEntries.companyId, companyId), eq(journalEntries.postingKey, postingKey)))
    .limit(1);
  const found = existing[0];
  if (!found) return;
  await db.delete(journalEntries).where(eq(journalEntries.id, found.id));
}

export async function ensureSystemAccounts(db: Database, companyId: string): Promise<void> {
  await db
    .insert(ledgerAccounts)
    .values(
      SYSTEM_ACCOUNTS.map((account) => ({
        companyId,
        code: account.code,
        name: account.name,
        type: account.type,
        isSystem: true,
      })),
    )
    .onConflictDoNothing();
}

/** Maps a category's job cost group to the expense account it posts to. */
export function expenseAccountForGroup(group: string): string {
  switch (group) {
    case 'materials':
      return ACCOUNTS.COST_MATERIALS.code;
    case 'labour':
      return ACCOUNTS.COST_LABOUR.code;
    case 'other':
      return ACCOUNTS.COST_OTHER.code;
    default:
      return ACCOUNTS.OVERHEADS.code;
  }
}
