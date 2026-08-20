import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  bankAccounts,
  categories,
  transactionLinks,
  transactions,
  suppliers,
} from '@/db/schema';
import { AppError, NotFoundError } from '@/lib/errors';
import type { IsoDate } from '@/lib/dates';
import { ACCOUNTS, expenseAccountForGroup, postEntry } from './ledger';
import { deriveCounterparty, normaliseDescription } from './normalise';
import { fromGross, rateFor, type VatTreatment } from './vat';
import { recordAudit, type DecisionSource } from './audit';
import { categorise, shouldAutoApply } from './categorisation';
import { closeExceptionsFor, raiseException } from './exceptions';
import { formatMoney } from '@/lib/money';

export type TransactionRow = typeof transactions.$inferSelect;

/**
 * Stable identity for an imported transaction. The same statement line
 * imported twice — from a CSV re-upload or a bank feed refresh — produces the
 * same hash and is skipped rather than duplicated.
 */
export function dedupeHashFor(input: {
  bankAccountId: string;
  transactionDate: IsoDate;
  amountPence: number;
  direction: 'money_in' | 'money_out';
  description: string;
  externalId?: string | null;
  /** Distinguishes genuinely repeated identical lines on the same day. */
  occurrence?: number;
}): string {
  const parts = input.externalId
    ? ['ext', input.bankAccountId, input.externalId]
    : [
        'line',
        input.bankAccountId,
        input.transactionDate,
        input.direction,
        String(input.amountPence),
        normaliseDescription(input.description),
        String(input.occurrence ?? 0),
      ];
  return createHash('sha256').update(parts.join('|')).digest('hex');
}

export type CreateTransactionInput = {
  companyId: string;
  bankAccountId: string;
  transactionDate: IsoDate;
  direction: 'money_in' | 'money_out';
  /** Always positive. */
  amountPence: number;
  description: string;
  reference?: string | null;
  balanceAfterPence?: number | null;
  externalId?: string | null;
  importBatchId?: string | null;
  source?: DecisionSource;
  rawPayload?: Record<string, unknown> | null;
  occurrence?: number;
  notes?: string | null;
};

export type CreateTransactionResult = {
  id: string;
  created: boolean;
  duplicateOf?: string;
};

/**
 * Inserts a transaction if it is new. Returns `created: false` for a
 * duplicate so importers can report accurately without failing.
 */
export async function createTransaction(
  db: Database,
  input: CreateTransactionInput,
): Promise<CreateTransactionResult> {
  if (input.amountPence <= 0) {
    throw new AppError('A transaction amount must be more than zero.');
  }

  const account = await db
    .select({ id: bankAccounts.id })
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, input.companyId), eq(bankAccounts.id, input.bankAccountId)))
    .limit(1);
  if (!account[0]) throw new NotFoundError('That bank account could not be found.');

  const dedupeHash = dedupeHashFor({
    bankAccountId: input.bankAccountId,
    transactionDate: input.transactionDate,
    amountPence: input.amountPence,
    direction: input.direction,
    description: input.description,
    externalId: input.externalId,
    occurrence: input.occurrence,
  });

  const existing = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(and(eq(transactions.companyId, input.companyId), eq(transactions.dedupeHash, dedupeHash)))
    .limit(1);

  if (existing[0]) {
    return { id: existing[0].id, created: false, duplicateOf: existing[0].id };
  }

  const [row] = await db
    .insert(transactions)
    .values({
      companyId: input.companyId,
      bankAccountId: input.bankAccountId,
      transactionDate: input.transactionDate,
      direction: input.direction,
      amountPence: input.amountPence,
      description: input.description.slice(0, 500),
      counterparty: deriveCounterparty(input.description) || null,
      reference: input.reference ?? null,
      balanceAfterPence: input.balanceAfterPence ?? null,
      externalId: input.externalId ?? null,
      importBatchId: input.importBatchId ?? null,
      source: input.source ?? 'user',
      rawPayload: input.rawPayload ?? null,
      dedupeHash,
      notes: input.notes ?? null,
      status: 'needs_answer',
    })
    .returning({ id: transactions.id });

  if (!row) throw new AppError('Could not save that transaction.');
  return { id: row.id, created: true };
}

export type ApplyCategorisationInput = {
  categoryId?: string | null;
  supplierId?: string | null;
  customerId?: string | null;
  jobId?: string | null;
  vatTreatment?: VatTreatment | null;
  isPersonal?: boolean | null;
  notes?: string | null;
  source: DecisionSource;
  confidence?: number | null;
  reason?: string | null;
  ruleId?: string | null;
  /** A person confirmed this — it becomes reusable history. */
  confirmedByUserId?: string | null;
};

/**
 * Applies a categorisation decision to a transaction, recalculates its VAT
 * split, updates its workflow status, posts the journal entry and writes the
 * audit trail. Every route into categorisation goes through here so the
 * derived state can never drift.
 */
export async function applyCategorisation(
  db: Database,
  companyId: string,
  transactionId: string,
  input: ApplyCategorisationInput,
): Promise<TransactionRow> {
  const current = await getTransaction(db, companyId, transactionId);

  const categoryId = input.categoryId !== undefined ? input.categoryId : current.categoryId;
  const category = categoryId ? await loadCategory(db, companyId, categoryId) : null;
  if (categoryId && !category) throw new NotFoundError('That category could not be found.');

  const isPersonal =
    input.isPersonal !== undefined && input.isPersonal !== null
      ? input.isPersonal
      : category?.code === 'personal'
        ? true
        : current.isPersonal;

  const treatment: VatTreatment =
    (input.vatTreatment ?? (category ? category.defaultVatTreatment : null) ?? current.vatTreatment) ??
    'standard';

  const split = fromGross(current.amountPence, treatment);

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  if (current.categoryId !== categoryId) changes.categoryId = { from: current.categoryId, to: categoryId };
  if (input.jobId !== undefined && current.jobId !== input.jobId) {
    changes.jobId = { from: current.jobId, to: input.jobId };
  }
  if (current.vatTreatment !== treatment) {
    changes.vatTreatment = { from: current.vatTreatment, to: treatment };
  }
  if (current.isPersonal !== isPersonal) changes.isPersonal = { from: current.isPersonal, to: isPersonal };

  const status = deriveStatus({
    categoryId,
    isPersonal,
    confirmed: Boolean(input.confirmedByUserId) || Boolean(current.confirmedAt),
    needsReceipt: current.needsReceipt,
    currentStatus: current.status,
  });

  const [updated] = await db
    .update(transactions)
    .set({
      categoryId,
      supplierId: input.supplierId !== undefined ? input.supplierId : current.supplierId,
      customerId: input.customerId !== undefined ? input.customerId : current.customerId,
      jobId: input.jobId !== undefined ? input.jobId : current.jobId,
      vatTreatment: treatment,
      vatRateBasisPoints: rateBasisPointsFor(treatment),
      netPence: split.net,
      vatPence: split.vat,
      isPersonal,
      status,
      categorySource: input.source,
      categoryConfidence: input.confidence ?? null,
      categoryReason: input.reason ?? null,
      appliedRuleId: input.ruleId ?? null,
      notes: input.notes !== undefined ? input.notes : current.notes,
      confirmedByUserId: input.confirmedByUserId ?? current.confirmedByUserId,
      confirmedAt: input.confirmedByUserId ? new Date() : current.confirmedAt,
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)))
    .returning();

  if (!updated) throw new NotFoundError('That transaction could not be found.');

  await postTransactionJournal(db, updated);

  await recordAudit(db, {
    companyId,
    action: 'transaction.categorised',
    entityType: 'transaction',
    entityId: transactionId,
    summary: category
      ? `${formatMoney(updated.amountPence)} ${updated.direction === 'money_in' ? 'in' : 'out'} categorised as ${category.name}.`
      : `${formatMoney(updated.amountPence)} updated.`,
    changes: Object.keys(changes).length ? changes : null,
    metadata: {
      source: input.source,
      confidence: input.confidence ?? null,
      reason: input.reason ?? null,
      ruleId: input.ruleId ?? null,
    },
    source: input.source,
    actorUserId: input.confirmedByUserId ?? null,
    actorLabel: input.confirmedByUserId ? null : sourceLabel(input.source),
  });

  if (categoryId) {
    await closeExceptionsFor(db, companyId, 'transaction', transactionId, {
      types: ['uncategorised_transaction', 'business_or_personal'],
      note: 'Categorised.',
      userId: input.confirmedByUserId ?? null,
    });
  }

  return updated;
}

function rateBasisPointsFor(treatment: VatTreatment): number {
  return rateFor(treatment);
}

function deriveStatus(input: {
  categoryId: string | null;
  isPersonal: boolean;
  confirmed: boolean;
  needsReceipt: boolean;
  currentStatus: TransactionRow['status'];
}): TransactionRow['status'] {
  if (input.currentStatus === 'excluded') return 'excluded';
  if (!input.categoryId) return 'needs_answer';
  if (input.needsReceipt && !input.isPersonal) return 'needs_receipt';
  return input.confirmed ? 'reviewed' : 'categorised';
}

function sourceLabel(source: DecisionSource): string {
  switch (source) {
    case 'rule':
      return 'TradeBooks rule';
    case 'history':
      return 'TradeBooks history';
    case 'heuristic':
      return 'TradeBooks matching';
    case 'ai_suggestion':
      return 'AI suggestion';
    case 'import':
      return 'Import';
    default:
      return 'TradeBooks';
  }
}

async function loadCategory(db: Database, companyId: string, categoryId: string) {
  const rows = await db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.id, categoryId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTransaction(
  db: Database,
  companyId: string,
  id: string,
): Promise<TransactionRow> {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('That transaction could not be found.');
  return row;
}

/**
 * Posts the double-entry for a transaction.
 *
 * When the transaction settles a bill or an invoice, the cost or the sale was
 * already recorded on that document, so the bank movement only clears the
 * creditor/debtor balance. Posting the expense again would double-count it.
 */
export async function postTransactionJournal(db: Database, row: TransactionRow): Promise<void> {
  const links = await db
    .select({ linkedType: transactionLinks.linkedType, amountPence: transactionLinks.amountPence })
    .from(transactionLinks)
    .where(eq(transactionLinks.transactionId, row.id));

  const postingKey = `transaction:${row.id}`;
  const signedBank = row.direction === 'money_in' ? row.amountPence : -row.amountPence;

  const settlesBill = links.some((l) => l.linkedType === 'bill');
  const settlesInvoice = links.some((l) => l.linkedType === 'invoice');

  if (row.status === 'excluded') {
    await postEntry(db, {
      companyId: row.companyId,
      entryDate: row.transactionDate,
      narrative: row.description,
      sourceType: 'transaction',
      sourceId: row.id,
      postingKey,
      lines: [],
    });
    return;
  }

  let contraAccount: string;
  let contraCategoryId: string | null = row.categoryId;

  if (settlesBill) {
    contraAccount = ACCOUNTS.CREDITORS.code;
    contraCategoryId = null;
  } else if (settlesInvoice) {
    contraAccount = ACCOUNTS.DEBTORS.code;
    contraCategoryId = null;
  } else if (row.isPersonal) {
    contraAccount = ACCOUNTS.DRAWINGS.code;
  } else if (!row.categoryId) {
    contraAccount = ACCOUNTS.SUSPENSE.code;
  } else {
    const category = await loadCategory(db, row.companyId, row.categoryId);
    contraAccount =
      category?.ledgerAccountCode ??
      (row.direction === 'money_in' ? ACCOUNTS.SALES.code : expenseAccountForGroup('none'));
  }

  const vat = settlesBill || settlesInvoice || row.isPersonal || !row.categoryId ? 0 : (row.vatPence ?? 0);
  const net = row.amountPence - vat;

  const lines = [
    { accountCode: ACCOUNTS.BANK.code, amountPence: signedBank, memo: row.description },
    {
      accountCode: contraAccount,
      amountPence: row.direction === 'money_in' ? -(vat === 0 ? row.amountPence : net) : vat === 0 ? row.amountPence : net,
      categoryId: contraCategoryId,
      jobId: row.jobId,
      memo: row.description,
    },
  ];

  if (vat !== 0) {
    lines.push({
      accountCode: ACCOUNTS.VAT_CONTROL.code,
      amountPence: row.direction === 'money_in' ? -vat : vat,
      categoryId: null,
      jobId: null,
      memo: 'VAT',
    });
  }

  await postEntry(db, {
    companyId: row.companyId,
    entryDate: row.transactionDate,
    narrative: row.description,
    sourceType: 'transaction',
    sourceId: row.id,
    postingKey,
    lines,
  });
}

/**
 * Runs the categorisation ladder over a transaction and either applies the
 * answer or raises an Ask Me question.
 */
export async function autoProcessTransaction(
  db: Database,
  companyId: string,
  transactionId: string,
  options: { allowAi?: boolean } = {},
): Promise<{ applied: boolean; exceptionId?: string; confidence: number; reason: string }> {
  const row = await getTransaction(db, companyId, transactionId);
  if (row.confirmedAt) {
    return { applied: false, confidence: 100, reason: 'Already confirmed by a person.' };
  }

  // A payment that already settles an invoice or a bill needs no category:
  // the sale or the cost lives on that document. Asking about it would be
  // asking a question the records have already answered.
  const settled = await settlesDocument(db, transactionId);
  if (settled) {
    await markSettledByDocument(db, companyId, transactionId, settled);
    return {
      applied: true,
      confidence: 100,
      reason: settled === 'invoice' ? 'Matched to a customer invoice.' : 'Matched to a supplier bill.',
    };
  }

  // Money in without a linked invoice: the useful question is which invoice
  // it pays, not which category it belongs to.
  if (row.direction === 'money_in') {
    const invoiceOutcome = await processIncomingPayment(db, companyId, row);
    if (invoiceOutcome) return invoiceOutcome;
  }

  const result = await categorise(
    db,
    {
      companyId,
      description: row.description,
      counterparty: row.counterparty,
      reference: row.reference,
      amountPence: row.amountPence,
      direction: row.direction,
      date: row.transactionDate,
    },
    options,
  );

  if (shouldAutoApply(result)) {
    await applyCategorisation(db, companyId, transactionId, {
      categoryId: result.categoryId,
      supplierId: result.supplierId ?? undefined,
      jobId: result.jobId ?? undefined,
      vatTreatment: result.vatTreatment ?? undefined,
      isPersonal: result.isPersonal ?? undefined,
      source: result.source,
      confidence: result.confidence,
      reason: result.reason,
      ruleId: result.ruleId,
    });
    if (result.ruleId) await bumpRuleUsage(db, result.ruleId);
    return { applied: true, confidence: result.confidence, reason: result.reason };
  }

  const exceptionId = await raiseTransactionQuestion(db, companyId, row, result);
  return { applied: false, exceptionId, confidence: result.confidence, reason: result.reason };
}


async function settlesDocument(db: Database, transactionId: string): Promise<'invoice' | 'bill' | null> {
  const links = await db
    .select({ linkedType: transactionLinks.linkedType })
    .from(transactionLinks)
    .where(eq(transactionLinks.transactionId, transactionId));
  if (links.some((l) => l.linkedType === 'bill')) return 'bill';
  if (links.some((l) => l.linkedType === 'invoice')) return 'invoice';
  return null;
}

async function markSettledByDocument(
  db: Database,
  companyId: string,
  transactionId: string,
  kind: 'invoice' | 'bill',
): Promise<void> {
  await db
    .update(transactions)
    .set({
      status: 'categorised',
      reconciliationStatus: 'matched',
      needsReceipt: false,
      categorySource: 'system',
      categoryConfidence: 100,
      categoryReason:
        kind === 'invoice'
          ? 'Settles a customer invoice, so the sale is already recorded there.'
          : 'Settles a supplier bill, so the cost is already recorded there.',
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)));

  await closeExceptionsFor(db, companyId, 'transaction', transactionId, {
    types: ['uncategorised_transaction', 'unallocated_payment', 'missing_receipt'],
    note: kind === 'invoice' ? 'Matched to an invoice.' : 'Matched to a bill.',
  });

  const row = await getTransaction(db, companyId, transactionId);
  await postTransactionJournal(db, row);
}

/**
 * Handles money in: allocate it to the invoice it obviously pays, or ask
 * which invoice it belongs to. Falls through to normal categorisation when
 * there are no open invoices it could relate to.
 */
async function processIncomingPayment(
  db: Database,
  companyId: string,
  row: TransactionRow,
): Promise<{ applied: boolean; exceptionId?: string; confidence: number; reason: string } | null> {
  const { findInvoiceMatchesForTransaction, describeReasons } = await import('./matching');
  const decision = await findInvoiceMatchesForTransaction(db, companyId, row);

  if (decision.outcome === 'auto' && decision.best) {
    const { recordPayment, refreshInvoiceStatus } = await import('./invoices');
    const invoice = decision.best.record;
    const outstanding = invoice.grossPence - invoice.cisDeductionPence - invoice.paidPence;
    const amount = Math.min(row.amountPence, Math.max(0, outstanding));
    if (amount > 0) {
      const paymentId = await recordPayment(db, {
        companyId,
        direction: 'customer_receipt',
        customerId: invoice.customerId,
        paymentDate: row.transactionDate,
        amountPence: row.amountPence,
        reference: row.reference,
        transactionId: row.id,
        allocations: [{ invoiceId: invoice.id, amountPence: amount }],
        source: 'heuristic',
        userId: null,
      }).catch(() => null);

      if (paymentId) {
        await linkTransaction(db, companyId, {
          transactionId: row.id,
          linkedType: 'invoice',
          linkedId: invoice.id,
          amountPence: amount,
          source: 'heuristic',
          confidence: Math.min(99, decision.best.score),
          reason: describeReasons(decision.best.reasons),
        });
        await refreshInvoiceStatus(db, companyId, invoice.id);
        await markSettledByDocument(db, companyId, row.id, 'invoice');
        return {
          applied: true,
          confidence: Math.min(99, decision.best.score),
          reason: `Matched to invoice ${invoice.number} because ${describeReasons(decision.best.reasons)}.`,
        };
      }
    }
  }

  if (decision.outcome === 'ask' && decision.candidates.length > 0) {
    const exceptionId = await raiseException(db, {
      companyId,
      type: 'unallocated_payment',
      subjectType: 'transaction',
      subjectId: row.id,
      question: `Which invoice does this ${formatMoney(row.amountPence)} payment cover?`,
      detail: row.description,
      candidates: [
        ...decision.candidates.slice(0, 4).map((candidate) => ({
          id: `invoice:${candidate.record.id}`,
          label: `${candidate.record.number} — ${formatMoney(
            candidate.record.grossPence - candidate.record.cisDeductionPence - candidate.record.paidPence,
          )} outstanding`,
          sublabel: describeReasons(candidate.reasons),
          action: { kind: 'allocate_invoice', invoiceId: candidate.record.id },
        })),
        {
          id: 'not-an-invoice',
          label: 'It is not paying an invoice',
          sublabel: 'Sort it as other income instead',
          action: { kind: 'other_income' },
        },
      ],
    });
    return {
      applied: false,
      exceptionId,
      confidence: decision.best?.score ?? 0,
      reason: 'More than one invoice could match.',
    };
  }

  return null;
}

async function bumpRuleUsage(db: Database, ruleId: string): Promise<void> {
  const { rules } = await import('@/db/schema');
  const { sql } = await import('drizzle-orm');
  await db
    .update(rules)
    .set({ timesApplied: sql`${rules.timesApplied} + 1`, lastAppliedAt: new Date() })
    .where(eq(rules.id, ruleId));
}

/** Builds the plain-English question and the one-tap answers for a transaction. */
export async function raiseTransactionQuestion(
  db: Database,
  companyId: string,
  row: TransactionRow,
  suggestion?: { categoryId: string | null; confidence: number; reason: string; supplierId: string | null },
): Promise<string> {
  const available = await db
    .select({ id: categories.id, name: categories.name, code: categories.code, kind: categories.kind })
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.isArchived, false)))
    .orderBy(categories.sortOrder);

  const relevant = available.filter((c) =>
    row.direction === 'money_in' ? c.kind !== 'expense' : c.kind !== 'income',
  );

  const candidates = [] as { id: string; label: string; sublabel?: string; action: Record<string, unknown> }[];

  if (suggestion?.categoryId) {
    const suggested = relevant.find((c) => c.id === suggestion.categoryId);
    if (suggested) {
      candidates.push({
        id: `suggested:${suggested.id}`,
        label: suggested.name,
        sublabel: suggestion.reason,
        action: { kind: 'set_category', categoryId: suggested.id, supplierId: suggestion.supplierId },
      });
    }
  }

  for (const category of relevant.slice(0, 8)) {
    if (candidates.some((c) => c.action.categoryId === category.id)) continue;
    if (category.code === 'uncategorised') continue;
    candidates.push({
      id: `category:${category.id}`,
      label: category.name,
      action: { kind: 'set_category', categoryId: category.id },
    });
  }

  candidates.push({
    id: 'personal',
    label: 'Personal, not business',
    action: { kind: 'mark_personal' },
  });

  const who = row.counterparty ? ` to ${titleCase(row.counterparty)}` : '';
  const question =
    row.direction === 'money_out'
      ? `What was this ${formatMoney(row.amountPence)} payment${who}?`
      : `What was this ${formatMoney(row.amountPence)} payment in${row.counterparty ? ` from ${titleCase(row.counterparty)}` : ''}?`;

  return raiseException(db, {
    companyId,
    type: 'uncategorised_transaction',
    subjectType: 'transaction',
    subjectId: row.id,
    question,
    detail: row.description,
    candidates,
  });
}

export function titleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word[0]!.toUpperCase() + word.slice(1)))
    .join(' ');
}

/** Marks a transaction as reviewed by a person. */
export async function markReviewed(
  db: Database,
  companyId: string,
  transactionId: string,
  userId: string,
): Promise<void> {
  const row = await getTransaction(db, companyId, transactionId);
  if (!row.categoryId && !row.isPersonal) {
    throw new AppError('Choose what this payment was for before marking it reviewed.');
  }
  await db
    .update(transactions)
    .set({
      status: 'reviewed',
      reconciliationStatus: 'reconciled',
      confirmedByUserId: userId,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)));

  await recordAudit(db, {
    companyId,
    action: 'transaction.reviewed',
    entityType: 'transaction',
    entityId: transactionId,
    summary: `${formatMoney(row.amountPence)} marked reviewed.`,
    actorUserId: userId,
  });
}

export async function linkTransaction(
  db: Database,
  companyId: string,
  input: {
    transactionId: string;
    linkedType: 'bill' | 'invoice' | 'payment' | 'document';
    linkedId: string;
    amountPence: number;
    source?: DecisionSource;
    confidence?: number;
    reason?: string;
  },
): Promise<void> {
  await db
    .insert(transactionLinks)
    .values({
      companyId,
      transactionId: input.transactionId,
      linkedType: input.linkedType,
      linkedId: input.linkedId,
      amountPence: input.amountPence,
      source: input.source ?? 'user',
      confidence: input.confidence ?? null,
      reason: input.reason ?? null,
    })
    .onConflictDoNothing();

  await db
    .update(transactions)
    .set({ reconciliationStatus: 'matched', updatedAt: new Date() })
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, input.transactionId)));

  const row = await getTransaction(db, companyId, input.transactionId);
  await postTransactionJournal(db, row);
}

export async function unlinkTransaction(
  db: Database,
  companyId: string,
  transactionId: string,
  linkedType: string,
  linkedId: string,
): Promise<void> {
  await db
    .delete(transactionLinks)
    .where(
      and(
        eq(transactionLinks.companyId, companyId),
        eq(transactionLinks.transactionId, transactionId),
        eq(transactionLinks.linkedType, linkedType),
        eq(transactionLinks.linkedId, linkedId),
      ),
    );
  const row = await getTransaction(db, companyId, transactionId);
  await postTransactionJournal(db, row);
}

/**
 * Flags statement lines that look like the same payment recorded twice.
 *
 * Only exact repeats are questioned — same account, same day, same amount and
 * the same description. Two genuinely separate fill-ups at the same station on
 * the same day do happen, so the owner is asked rather than told.
 */
export async function flagSuspectedDuplicates(
  db: Database,
  companyId: string,
  transactionIds: string[],
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), inArray(transactions.id, transactionIds)));

  const groups = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    const key = [row.bankAccountId, row.transactionDate, row.direction, row.amountPence, normaliseDescription(row.description)].join('|');
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }

  let raised = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group as [TransactionRow, ...TransactionRow[]];
    for (const duplicate of rest) {
      await raiseException(db, {
        companyId,
        type: 'duplicate_suspected',
        subjectType: 'transaction',
        subjectId: duplicate.id,
        question: `You paid ${formatMoney(duplicate.amountPence)} to ${titleCase(duplicate.counterparty ?? duplicate.description)} twice on ${duplicate.transactionDate}. Is that right?`,
        detail: duplicate.description,
        dedupeKey: `duplicate_suspected:${first.id}:${duplicate.id}`,
        candidates: [
          {
            id: 'both-real',
            label: 'Yes, both are real',
            sublabel: 'Keep them both',
            action: { kind: 'not_duplicate' },
          },
          {
            id: 'exclude',
            label: 'No, one is a mistake',
            sublabel: 'Leave this one out of the books',
            action: { kind: 'dismiss', note: 'Marked as a duplicate by the owner.' },
          },
        ],
      });
      raised += 1;
    }
  }
  return raised;
}

export async function supplierNamesFor(db: Database, companyId: string, ids: string[]) {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db
    .select({ id: suppliers.id, name: suppliers.name })
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), inArray(suppliers.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}
