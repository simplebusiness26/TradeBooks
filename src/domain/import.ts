import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { importBatches } from '@/db/schema';
import { parseCsv, pickColumn } from '@/lib/csv';
import { parseMoneyInput, MoneyError } from '@/lib/money';
import { isIsoDate, makeIso, type IsoDate } from '@/lib/dates';
import { AppError, ValidationError } from '@/lib/errors';
import { autoProcessTransaction, createTransaction } from './transactions';
import { recordAudit } from './audit';

export type ImportResult = {
  batchId: string;
  rowCount: number;
  imported: number;
  duplicates: number;
  errors: { row: number; message: string }[];
  alreadyImported: boolean;
};

export type StatementRow = {
  date: IsoDate;
  description: string;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  reference: string | null;
  balanceAfterPence: number | null;
  raw: Record<string, string>;
};

const DATE_COLUMNS = ['date', 'transactiondate', 'transaction date', 'posteddate', 'valuedate', 'datetime'];
const DESCRIPTION_COLUMNS = ['description', 'details', 'narrative', 'reference', 'transaction', 'memo', 'payee'];
const AMOUNT_COLUMNS = ['amount', 'value', 'transactionamount'];
const DEBIT_COLUMNS = ['debit', 'paidout', 'moneyout', 'withdrawal', 'payments'];
const CREDIT_COLUMNS = ['credit', 'paidin', 'moneyin', 'deposit', 'receipts'];
const BALANCE_COLUMNS = ['balance', 'runningbalance', 'balanceafter'];
const REFERENCE_COLUMNS = ['reference', 'ref', 'transactionref', 'type'];

/**
 * Reads a bank CSV export into canonical statement rows.
 *
 * Column names are matched flexibly because every bank names them
 * differently. Both single-amount (signed) and separate debit/credit column
 * layouts are supported.
 */
export function parseStatementCsv(content: string): { rows: StatementRow[]; errors: { row: number; message: string }[]; total: number } {
  const { headers, rows } = parseCsv(content);
  if (headers.length === 0) {
    throw new ValidationError('That file does not look like a CSV statement — no column headings were found.');
  }

  const dateColumn = pickColumn(headers, DATE_COLUMNS);
  const descriptionColumn = pickColumn(headers, DESCRIPTION_COLUMNS);
  const amountColumn = pickColumn(headers, AMOUNT_COLUMNS);
  const debitColumn = pickColumn(headers, DEBIT_COLUMNS);
  const creditColumn = pickColumn(headers, CREDIT_COLUMNS);
  const balanceColumn = pickColumn(headers, BALANCE_COLUMNS);
  const referenceColumn = pickColumn(headers, REFERENCE_COLUMNS);

  if (!dateColumn) {
    throw new ValidationError(`Could not find a date column. Columns found: ${headers.join(', ')}.`);
  }
  if (!descriptionColumn) {
    throw new ValidationError(`Could not find a description column. Columns found: ${headers.join(', ')}.`);
  }
  if (!amountColumn && !debitColumn && !creditColumn) {
    throw new ValidationError(
      `Could not find an amount column. Expected one of: amount, or separate paid in / paid out columns. Columns found: ${headers.join(', ')}.`,
    );
  }

  const parsed: StatementRow[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    const lineNumber = index + 2; // account for the header line
    try {
      const date = parseFlexibleDate(row[dateColumn] ?? '');
      if (!date) throw new AppError(`Could not read the date "${row[dateColumn]}".`);

      const description = (row[descriptionColumn] ?? '').trim();
      if (!description) throw new AppError('The description is empty.');

      let signed: number;
      if (amountColumn && (row[amountColumn] ?? '').trim() !== '') {
        signed = parseMoneyInput(row[amountColumn] ?? '');
      } else {
        const debit = debitColumn && row[debitColumn]?.trim() ? parseMoneyInput(row[debitColumn]) : 0;
        const credit = creditColumn && row[creditColumn]?.trim() ? parseMoneyInput(row[creditColumn]) : 0;
        signed = credit - Math.abs(debit);
      }

      if (signed === 0) throw new AppError('The amount is zero.');

      parsed.push({
        date,
        description,
        amountPence: Math.abs(signed),
        direction: signed > 0 ? 'money_in' : 'money_out',
        reference: referenceColumn ? (row[referenceColumn] ?? null) : null,
        balanceAfterPence:
          balanceColumn && row[balanceColumn]?.trim() ? safeMoney(row[balanceColumn]) : null,
        raw: row,
      });
    } catch (error) {
      errors.push({
        row: lineNumber,
        message: error instanceof MoneyError || error instanceof AppError ? error.message : 'Could not read this row.',
      });
    }
  });

  return { rows: parsed, errors, total: rows.length };
}

function safeMoney(value: string): number | null {
  try {
    return parseMoneyInput(value);
  } catch {
    return null;
  }
}

/** Accepts ISO, UK day-first and US month-first dates, plus "5 Jun 2026". */
export function parseFlexibleDate(value: string): IsoDate | null {
  const text = value.trim();
  if (!text) return null;
  if (isIsoDate(text.slice(0, 10))) return text.slice(0, 10);

  const numeric = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/.exec(text);
  if (numeric?.[1] && numeric[2] && numeric[3]) {
    const a = Number(numeric[1]);
    const b = Number(numeric[2]);
    const c = Number(numeric[3]);
    if (numeric[1].length === 4) {
      return isIsoDate(makeIso(a, b, c)) ? makeIso(a, b, c) : null;
    }
    // UK statements are day-first; only fall back to month-first when the
    // first number cannot be a day.
    const year = c < 100 ? 2000 + c : c;
    if (a <= 31 && b <= 12) return makeIso(year, b, a);
    if (b <= 31 && a <= 12) return makeIso(year, a, b);
    return null;
  }

  const named = /^(\d{1,2})\s*(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?[\s-]+(\d{2,4})/.exec(text);
  if (named?.[1] && named[2] && named[3]) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) {
      const year = Number(named[3]) < 100 ? 2000 + Number(named[3]) : Number(named[3]);
      return makeIso(year, month, Number(named[1]));
    }
  }
  return null;
}

export type ImportStatementInput = {
  companyId: string;
  bankAccountId: string;
  filename: string;
  content: string;
  userId: string;
  /** Skip the categorisation pass — used by the seed for speed. */
  skipAutoProcess?: boolean;
};

/**
 * Imports a bank statement CSV.
 *
 * Idempotent twice over: the file's content hash prevents re-importing the
 * same upload, and each row's dedupe hash prevents the same line appearing
 * twice even when it arrives in a different file.
 */
export async function importStatement(db: Database, input: ImportStatementInput): Promise<ImportResult> {
  const contentHash = createHash('sha256')
    .update(`${input.bankAccountId}|${input.content}`)
    .digest('hex');

  const existing = await db
    .select()
    .from(importBatches)
    .where(eq(importBatches.contentHash, contentHash))
    .limit(1);

  if (existing[0] && existing[0].companyId === input.companyId) {
    return {
      batchId: existing[0].id,
      rowCount: existing[0].rowCount,
      imported: existing[0].importedCount,
      duplicates: existing[0].duplicateCount,
      errors: existing[0].errors,
      alreadyImported: true,
    };
  }

  const { rows, errors, total } = parseStatementCsv(input.content);

  const [batch] = await db
    .insert(importBatches)
    .values({
      companyId: input.companyId,
      kind: 'csv_transactions',
      filename: input.filename.slice(0, 240),
      bankAccountId: input.bankAccountId,
      rowCount: total,
      contentHash,
      createdByUserId: input.userId,
    })
    .returning({ id: importBatches.id });

  if (!batch) throw new AppError('Could not start that import.');

  // Identical lines on the same day are legitimate; number them so each is kept.
  const seen = new Map<string, number>();
  let imported = 0;
  let duplicates = 0;
  const createdIds: string[] = [];

  for (const row of rows) {
    const key = `${row.date}|${row.direction}|${row.amountPence}|${row.description}`;
    const occurrence = seen.get(key) ?? 0;
    seen.set(key, occurrence + 1);

    try {
      const result = await createTransaction(db, {
        companyId: input.companyId,
        bankAccountId: input.bankAccountId,
        transactionDate: row.date,
        direction: row.direction,
        amountPence: row.amountPence,
        description: row.description,
        reference: row.reference,
        balanceAfterPence: row.balanceAfterPence,
        importBatchId: batch.id,
        source: 'import',
        rawPayload: row.raw,
        occurrence,
      });
      if (result.created) {
        imported += 1;
        createdIds.push(result.id);
      } else {
        duplicates += 1;
      }
    } catch (error) {
      errors.push({ row: 0, message: error instanceof Error ? error.message : 'Could not import a row.' });
    }
  }

  await db
    .update(importBatches)
    .set({ importedCount: imported, duplicateCount: duplicates, errorCount: errors.length, errors })
    .where(eq(importBatches.id, batch.id));

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'import.statement',
    entityType: 'import_batch',
    entityId: batch.id,
    summary: `Imported ${imported} transaction${imported === 1 ? '' : 's'} from "${input.filename}" (${duplicates} already present, ${errors.length} could not be read).`,
    source: 'import',
    actorUserId: input.userId,
  });

  if (!input.skipAutoProcess) {
    for (const id of createdIds) {
      await autoProcessTransaction(db, input.companyId, id);
    }
  }

  return {
    batchId: batch.id,
    rowCount: total,
    imported,
    duplicates,
    errors,
    alreadyImported: false,
  };
}
