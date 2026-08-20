import { and, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { customers, documents, invoices, suppliers, transactions } from '@/db/schema';
import { addDays, daysBetween, type IsoDate } from '@/lib/dates';
import { similarity } from './normalise';

export type MatchCandidate<T> = {
  record: T;
  score: number;
  reasons: string[];
};

/** A match is applied automatically only at or above this score. */
export const AUTO_MATCH_THRESHOLD = 85;
/** ...and only when it is clearly better than the runner-up. */
export const AUTO_MATCH_MARGIN = 20;

export type MatchDecision<T> = {
  best: MatchCandidate<T> | null;
  candidates: MatchCandidate<T>[];
  /** 'auto' applies immediately, 'ask' raises a question, 'none' found nothing. */
  outcome: 'auto' | 'ask' | 'none';
};

export function decide<T>(candidates: MatchCandidate<T>[]): MatchDecision<T> {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const best = sorted[0] ?? null;
  const runnerUp = sorted[1];
  if (!best || best.score < 40) return { best: null, candidates: sorted, outcome: 'none' };
  const clear = !runnerUp || best.score - runnerUp.score >= AUTO_MATCH_MARGIN;
  return {
    best,
    candidates: sorted,
    outcome: best.score >= AUTO_MATCH_THRESHOLD && clear ? 'auto' : 'ask',
  };
}

export type ReceiptMatchInput = {
  companyId: string;
  grossPence: number | null;
  documentDate: IsoDate | null;
  supplierId: string | null;
  supplierNameText: string | null;
  excludeDocumentId?: string;
};

export type TransactionCandidate = typeof transactions.$inferSelect;

/**
 * Finds the bank transactions a receipt might belong to. Scoring is
 * deterministic and every point is explainable in the Ask Me question.
 */
export async function findTransactionMatchesForReceipt(
  db: Database,
  input: ReceiptMatchInput,
): Promise<MatchDecision<TransactionCandidate>> {
  if (!input.grossPence && !input.documentDate) {
    return { best: null, candidates: [], outcome: 'none' };
  }

  const windowStart = input.documentDate ? addDays(input.documentDate, -21) : undefined;
  const windowEnd = input.documentDate ? addDays(input.documentDate, 21) : undefined;

  const conditions = [
    eq(transactions.companyId, input.companyId),
    eq(transactions.direction, 'money_out'),
    sql`${transactions.status} <> 'excluded'`,
  ];
  if (windowStart && windowEnd) {
    conditions.push(gte(transactions.transactionDate, windowStart));
    conditions.push(lte(transactions.transactionDate, windowEnd));
  }
  if (input.grossPence) {
    // Allow for a receipt total that differs slightly from the card amount.
    const low = Math.floor(input.grossPence * 0.9);
    const high = Math.ceil(input.grossPence * 1.1) + 100;
    conditions.push(gte(transactions.amountPence, low));
    conditions.push(lte(transactions.amountPence, high));
  }

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .limit(40);

  // A transaction already carrying a different receipt is a weaker candidate.
  const alreadyMatched = await db
    .select({ transactionId: documents.matchedTransactionId })
    .from(documents)
    .where(
      and(
        eq(documents.companyId, input.companyId),
        sql`${documents.matchedTransactionId} is not null`,
        input.excludeDocumentId ? sql`${documents.id} <> ${input.excludeDocumentId}` : sql`true`,
      ),
    );
  const takenIds = new Set(alreadyMatched.map((r) => r.transactionId).filter(Boolean) as string[]);

  const supplierName = input.supplierNameText ?? (await supplierNameFor(db, input.companyId, input.supplierId));

  const candidates = rows.map((row) => {
    const reasons: string[] = [];
    let score = 0;

    if (input.grossPence) {
      const diff = Math.abs(row.amountPence - input.grossPence);
      if (diff === 0) {
        score += 55;
        reasons.push('the amount matches exactly');
      } else if (diff <= 100) {
        score += 40;
        reasons.push('the amount is within £1');
      } else if (diff <= input.grossPence * 0.02) {
        score += 25;
        reasons.push('the amount is within 2%');
      }
    }

    if (input.documentDate) {
      const gap = Math.abs(daysBetween(input.documentDate, row.transactionDate));
      if (gap === 0) {
        score += 25;
        reasons.push('same day');
      } else if (gap <= 3) {
        score += 18;
        reasons.push(`${gap} day${gap === 1 ? '' : 's'} apart`);
      } else if (gap <= 7) {
        score += 10;
        reasons.push('within a week');
      } else if (gap <= 21) {
        score += 3;
      }
    }

    if (input.supplierId && row.supplierId === input.supplierId) {
      score += 20;
      reasons.push('same supplier');
    } else if (supplierName) {
      const nameScore = similarity(row.description, supplierName);
      if (nameScore >= 0.6) {
        score += 18;
        reasons.push('the supplier name matches');
      } else if (nameScore >= 0.35) {
        score += 8;
      }
    }

    if (takenIds.has(row.id)) {
      score -= 30;
      reasons.push('already has a receipt');
    }

    return { record: row, score, reasons };
  });

  return decide(candidates.filter((c) => c.score > 0));
}

async function supplierNameFor(
  db: Database,
  companyId: string,
  supplierId: string | null,
): Promise<string | null> {
  if (!supplierId) return null;
  const rows = await db
    .select({ name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.id, supplierId)))
    .limit(1);
  return rows[0]?.name ?? null;
}

export type ReceiptCandidate = typeof documents.$inferSelect;

/** The mirror image: unfiled receipts that might belong to a transaction. */
export async function findReceiptMatchesForTransaction(
  db: Database,
  companyId: string,
  transaction: TransactionCandidate,
): Promise<MatchDecision<ReceiptCandidate>> {
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.companyId, companyId),
        isNull(documents.matchedTransactionId),
        or(eq(documents.kind, 'receipt'), eq(documents.kind, 'purchase_invoice'))!,
      ),
    )
    .limit(60);

  const candidates = rows.map((row) => {
    const reasons: string[] = [];
    let score = 0;

    if (row.grossPence) {
      const diff = Math.abs(row.grossPence - transaction.amountPence);
      if (diff === 0) {
        score += 55;
        reasons.push('the amount matches exactly');
      } else if (diff <= 100) {
        score += 40;
        reasons.push('the amount is within £1');
      }
    }

    if (row.documentDate) {
      const gap = Math.abs(daysBetween(row.documentDate, transaction.transactionDate));
      if (gap === 0) {
        score += 25;
        reasons.push('same day');
      } else if (gap <= 3) {
        score += 18;
        reasons.push(`${gap} day${gap === 1 ? '' : 's'} apart`);
      } else if (gap <= 7) {
        score += 10;
      }
    }

    if (transaction.supplierId && row.supplierId === transaction.supplierId) {
      score += 20;
      reasons.push('same supplier');
    } else if (row.supplierNameText) {
      const nameScore = similarity(transaction.description, row.supplierNameText);
      if (nameScore >= 0.6) {
        score += 18;
        reasons.push('the supplier name matches');
      }
    }

    return { record: row, score, reasons };
  });

  return decide(candidates.filter((c) => c.score > 0));
}

export type InvoiceCandidate = typeof invoices.$inferSelect;

/**
 * Finds the customer invoices a money-in transaction might be paying.
 * A reference containing the invoice number is treated as near-certain.
 */
export async function findInvoiceMatchesForTransaction(
  db: Database,
  companyId: string,
  transaction: TransactionCandidate,
): Promise<MatchDecision<InvoiceCandidate>> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), sql`${invoices.status} in ('sent','part_paid','overdue')`))
    .limit(100);

  const haystack = `${transaction.description} ${transaction.reference ?? ''}`.toLowerCase();
  const customerRows = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(eq(customers.companyId, companyId));
  const customerNames = new Map(customerRows.map((c) => [c.id, c.name]));

  const candidates = rows.map((row) => {
    const reasons: string[] = [];
    let score = 0;
    const outstanding = row.grossPence - row.cisDeductionPence - row.paidPence;

    const numberKey = row.number.toLowerCase().replace(/[^a-z0-9]/g, '');
    const haystackKey = haystack.replace(/[^a-z0-9]/g, '');
    if (numberKey.length >= 4 && haystackKey.includes(numberKey)) {
      score += 60;
      reasons.push(`the reference mentions ${row.number}`);
    }

    if (outstanding === transaction.amountPence) {
      score += 40;
      reasons.push('the amount matches what is outstanding');
    } else if (row.grossPence === transaction.amountPence) {
      score += 35;
      reasons.push('the amount matches the invoice total');
    } else if (Math.abs(outstanding - transaction.amountPence) <= 100) {
      score += 20;
      reasons.push('the amount is within £1 of the balance');
    }

    const customerName = customerNames.get(row.customerId);
    if (customerName) {
      const nameScore = similarity(transaction.description, customerName);
      if (nameScore >= 0.6) {
        score += 20;
        reasons.push(`it looks like a payment from ${customerName}`);
      } else if (nameScore >= 0.35) {
        score += 8;
      }
    }

    const gap = daysBetween(row.issueDate, transaction.transactionDate);
    if (gap < -3) {
      score -= 25;
      reasons.push('paid before the invoice was raised');
    } else if (gap <= 60) {
      score += 5;
    }

    return { record: row, score, reasons };
  });

  return decide(candidates.filter((c) => c.score > 0));
}

export function describeReasons(reasons: string[]): string {
  if (reasons.length === 0) return '';
  if (reasons.length === 1) return reasons[0]!;
  return `${reasons.slice(0, -1).join(', ')} and ${reasons.at(-1)}`;
}
