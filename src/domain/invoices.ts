import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  customers,
  invoiceLines,
  invoices,
  paymentAllocations,
  payments,
  transactions,
} from '@/db/schema';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { addDays, todayIso, type IsoDate } from '@/lib/dates';
import { addPence, formatMoney, multiplyByMilliQuantity, type Pence } from '@/lib/money';
import { ACCOUNTS, postEntry, type JournalLineInput } from './ledger';
import { fromNet, rateFor, type VatTreatment } from './vat';
import { recordAudit, type DecisionSource } from './audit';
import { closeExceptionsFor } from './exceptions';

export type InvoiceRow = typeof invoices.$inferSelect;
export type InvoiceLineRow = typeof invoiceLines.$inferSelect;

export type InvoiceLineInput = {
  description: string;
  quantityMilli: number;
  unitPricePence: Pence;
  vatTreatment: VatTreatment;
  categoryId?: string | null;
  jobId?: string | null;
  isLabour?: boolean;
};

export type CreateInvoiceInput = {
  companyId: string;
  customerId: string;
  jobId?: string | null;
  issueDate: IsoDate;
  dueDate?: IsoDate;
  reference?: string | null;
  notes?: string | null;
  terms?: string | null;
  lines: InvoiceLineInput[];
  createdByUserId: string;
  /** Applies a CIS deduction the customer will withhold from labour lines. */
  cisDeductionRateBasisPoints?: number | null;
};

export function calculateInvoiceTotals(lines: InvoiceLineInput[]): {
  lines: (InvoiceLineInput & { netPence: Pence; vatPence: Pence; grossPence: Pence; rate: number })[];
  netPence: Pence;
  vatPence: Pence;
  grossPence: Pence;
} {
  const priced = lines.map((line) => {
    const net = multiplyByMilliQuantity(line.unitPricePence, line.quantityMilli);
    const amounts = fromNet(net, line.vatTreatment);
    return { ...line, netPence: amounts.net, vatPence: amounts.vat, grossPence: amounts.gross, rate: rateFor(line.vatTreatment) };
  });
  const netPence = addPence(...priced.map((l) => l.netPence));
  const vatPence = addPence(...priced.map((l) => l.vatPence));
  return { lines: priced, netPence, vatPence, grossPence: addPence(netPence, vatPence) };
}

/** Next sequential invoice number for the company, e.g. INV-0007. */
export async function nextInvoiceNumber(db: Database, companyId: string): Promise<string> {
  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(eq(invoices.companyId, companyId))
    .orderBy(desc(invoices.createdAt))
    .limit(50);
  const highest = rows.reduce((max, row) => {
    const match = /(\d+)\s*$/.exec(row.number);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `INV-${String(highest + 1).padStart(4, '0')}`;
}

export async function createInvoice(db: Database, input: CreateInvoiceInput): Promise<InvoiceRow> {
  if (input.lines.length === 0) {
    throw new ValidationError('Add at least one line to the invoice.', { lines: ['Add at least one line.'] });
  }

  const customer = await db
    .select({ id: customers.id, name: customers.name, paymentTermsDays: customers.paymentTermsDays })
    .from(customers)
    .where(and(eq(customers.companyId, input.companyId), eq(customers.id, input.customerId)))
    .limit(1);
  const foundCustomer = customer[0];
  if (!foundCustomer) throw new NotFoundError('That customer could not be found.');

  const totals = calculateInvoiceTotals(input.lines);
  const dueDate = input.dueDate ?? addDays(input.issueDate, foundCustomer.paymentTermsDays);
  const number = await nextInvoiceNumber(db, input.companyId);

  const cisRate = input.cisDeductionRateBasisPoints ?? 0;
  const labourNet = addPence(
    ...totals.lines.filter((l) => l.isLabour).map((l) => l.netPence),
  );
  const cisDeduction = cisRate > 0 ? Math.round((labourNet * cisRate) / 10_000) : 0;

  const [row] = await db
    .insert(invoices)
    .values({
      companyId: input.companyId,
      number,
      customerId: input.customerId,
      jobId: input.jobId ?? null,
      status: 'draft',
      issueDate: input.issueDate,
      dueDate,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      terms: input.terms ?? null,
      netPence: totals.netPence,
      vatPence: totals.vatPence,
      grossPence: totals.grossPence,
      cisDeductionPence: cisDeduction,
      createdByUserId: input.createdByUserId,
    })
    .returning();

  if (!row) throw new AppError('Could not create that invoice.');

  await db.insert(invoiceLines).values(
    totals.lines.map((line, index) => ({
      companyId: input.companyId,
      invoiceId: row.id,
      position: index,
      description: line.description,
      quantityMilli: line.quantityMilli,
      unitPricePence: line.unitPricePence,
      netPence: line.netPence,
      vatTreatment: line.vatTreatment,
      vatRateBasisPoints: line.rate,
      vatPence: line.vatPence,
      grossPence: line.grossPence,
      categoryId: line.categoryId ?? null,
      jobId: line.jobId ?? input.jobId ?? null,
      isLabour: line.isLabour ? 1 : 0,
    })),
  );

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'invoice.created',
    entityType: 'invoice',
    entityId: row.id,
    summary: `Invoice ${number} created for ${foundCustomer.name}, ${formatMoney(totals.grossPence)}.`,
    actorUserId: input.createdByUserId,
  });

  return row;
}

export async function replaceInvoiceLines(
  db: Database,
  companyId: string,
  invoiceId: string,
  lines: InvoiceLineInput[],
  userId: string,
): Promise<InvoiceRow> {
  const invoice = await getInvoice(db, companyId, invoiceId);
  if (invoice.status === 'void') throw new AppError('This invoice has been cancelled.');
  if (invoice.paidPence > 0) {
    throw new AppError('This invoice has payments against it. Remove the payments before changing the lines.');
  }
  if (lines.length === 0) {
    throw new ValidationError('Add at least one line to the invoice.', { lines: ['Add at least one line.'] });
  }

  const totals = calculateInvoiceTotals(lines);
  await db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, invoiceId));
  await db.insert(invoiceLines).values(
    totals.lines.map((line, index) => ({
      companyId,
      invoiceId,
      position: index,
      description: line.description,
      quantityMilli: line.quantityMilli,
      unitPricePence: line.unitPricePence,
      netPence: line.netPence,
      vatTreatment: line.vatTreatment,
      vatRateBasisPoints: line.rate,
      vatPence: line.vatPence,
      grossPence: line.grossPence,
      categoryId: line.categoryId ?? null,
      jobId: line.jobId ?? invoice.jobId,
      isLabour: line.isLabour ? 1 : 0,
    })),
  );

  const [updated] = await db
    .update(invoices)
    .set({
      netPence: totals.netPence,
      vatPence: totals.vatPence,
      grossPence: totals.grossPence,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)))
    .returning();

  if (!updated) throw new NotFoundError('That invoice could not be found.');

  await recordAudit(db, {
    companyId,
    action: 'invoice.updated',
    entityType: 'invoice',
    entityId: invoiceId,
    summary: `Invoice ${invoice.number} lines changed; new total ${formatMoney(totals.grossPence)}.`,
    changes: { grossPence: { from: invoice.grossPence, to: totals.grossPence } },
    actorUserId: userId,
  });

  if (updated.status !== 'draft') await postInvoiceJournal(db, updated);
  return updated;
}

export async function getInvoice(db: Database, companyId: string, id: string): Promise<InvoiceRow> {
  const rows = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('That invoice could not be found.');
  return row;
}

export async function sendInvoice(
  db: Database,
  companyId: string,
  invoiceId: string,
  userId: string,
): Promise<InvoiceRow> {
  const invoice = await getInvoice(db, companyId, invoiceId);
  if (invoice.status !== 'draft') return invoice;

  const [updated] = await db
    .update(invoices)
    .set({ status: 'sent', sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)))
    .returning();
  if (!updated) throw new NotFoundError('That invoice could not be found.');

  await postInvoiceJournal(db, updated);
  await recordAudit(db, {
    companyId,
    action: 'invoice.sent',
    entityType: 'invoice',
    entityId: invoiceId,
    summary: `Invoice ${invoice.number} marked as sent.`,
    actorUserId: userId,
  });
  return refreshInvoiceStatus(db, companyId, invoiceId);
}

export async function voidInvoice(
  db: Database,
  companyId: string,
  invoiceId: string,
  userId: string,
  reason: string,
): Promise<InvoiceRow> {
  const invoice = await getInvoice(db, companyId, invoiceId);
  if (invoice.paidPence > 0) {
    throw new AppError('This invoice has been paid. Record a credit or refund instead of cancelling it.');
  }
  const [updated] = await db
    .update(invoices)
    .set({ status: 'void', voidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)))
    .returning();
  if (!updated) throw new NotFoundError('That invoice could not be found.');

  await postEntry(db, {
    companyId,
    entryDate: invoice.issueDate,
    narrative: `Invoice ${invoice.number} cancelled`,
    sourceType: 'invoice',
    sourceId: invoiceId,
    postingKey: `invoice:${invoiceId}`,
    lines: [],
  });

  await recordAudit(db, {
    companyId,
    action: 'invoice.voided',
    entityType: 'invoice',
    entityId: invoiceId,
    summary: `Invoice ${invoice.number} cancelled: ${reason}`,
    actorUserId: userId,
  });
  return updated;
}

/**
 * Recomputes paid total and status from the allocations that exist. Status is
 * always derived, never set by hand, so it cannot disagree with the money.
 */
export async function refreshInvoiceStatus(
  db: Database,
  companyId: string,
  invoiceId: string,
  today: IsoDate = todayIso(),
): Promise<InvoiceRow> {
  const invoice = await getInvoice(db, companyId, invoiceId);
  if (invoice.status === 'void' || invoice.status === 'draft') return invoice;

  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amountPence}), 0)::bigint` })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.companyId, companyId), eq(paymentAllocations.invoiceId, invoiceId)));

  const paid = Number(rows[0]?.total ?? 0);
  const outstanding = invoice.grossPence - invoice.cisDeductionPence - paid;

  let status: InvoiceRow['status'];
  if (outstanding <= 0) status = 'paid';
  else if (paid > 0) status = invoice.dueDate < today ? 'overdue' : 'part_paid';
  else status = invoice.dueDate < today ? 'overdue' : 'sent';

  const [updated] = await db
    .update(invoices)
    .set({
      paidPence: paid,
      status,
      paidAt: status === 'paid' ? (invoice.paidAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(invoices.companyId, companyId), eq(invoices.id, invoiceId)))
    .returning();

  if (!updated) throw new NotFoundError('That invoice could not be found.');
  if (status === 'paid') {
    await closeExceptionsFor(db, companyId, 'invoice', invoiceId);
  }
  return updated;
}

export function outstandingPence(invoice: InvoiceRow): Pence {
  if (invoice.status === 'void' || invoice.status === 'draft') return 0;
  return Math.max(0, invoice.grossPence - invoice.cisDeductionPence - invoice.paidPence);
}

/** Posts the sale: debtors debit, sales and VAT credit. */
export async function postInvoiceJournal(db: Database, invoice: InvoiceRow): Promise<void> {
  if (invoice.status === 'draft' || invoice.status === 'void') return;

  const lines = await db.select().from(invoiceLines).where(eq(invoiceLines.invoiceId, invoice.id));

  const journalLines: JournalLineInput[] = [
    {
      accountCode: ACCOUNTS.DEBTORS.code,
      amountPence: invoice.grossPence - invoice.cisDeductionPence,
      memo: `Invoice ${invoice.number}`,
    },
  ];

  if (invoice.cisDeductionPence > 0) {
    journalLines.push({
      accountCode: ACCOUNTS.CIS_CONTROL.code,
      amountPence: invoice.cisDeductionPence,
      memo: 'CIS deducted by customer',
    });
  }

  for (const line of lines) {
    journalLines.push({
      accountCode: ACCOUNTS.SALES.code,
      amountPence: -line.netPence,
      memo: line.description,
      ...(line.jobId ? { jobId: line.jobId } : {}),
      ...(line.categoryId ? { categoryId: line.categoryId } : {}),
    });
  }

  if (invoice.vatPence !== 0) {
    journalLines.push({
      accountCode: ACCOUNTS.VAT_CONTROL.code,
      amountPence: -invoice.vatPence,
      memo: 'VAT on sales',
    });
  }

  await postEntry(db, {
    companyId: invoice.companyId,
    entryDate: invoice.issueDate,
    narrative: `Invoice ${invoice.number}`,
    sourceType: 'invoice',
    sourceId: invoice.id,
    postingKey: `invoice:${invoice.id}`,
    lines: journalLines,
  });
}

export type RecordPaymentInput = {
  companyId: string;
  customerId?: string | null;
  supplierId?: string | null;
  direction: 'customer_receipt' | 'supplier_payment';
  paymentDate: IsoDate;
  amountPence: Pence;
  method?: string;
  reference?: string | null;
  notes?: string | null;
  transactionId?: string | null;
  allocations?: { invoiceId?: string; billId?: string; amountPence: Pence }[];
  source?: DecisionSource;
  /** Null when TradeBooks matched it automatically rather than a person. */
  userId: string | null;
};

/** Records a payment and allocates it across invoices or bills. */
export async function recordPayment(db: Database, input: RecordPaymentInput): Promise<string> {
  if (input.amountPence <= 0) throw new AppError('A payment must be more than zero.');

  const allocations = input.allocations ?? [];
  const allocated = allocations.reduce((sum, a) => sum + a.amountPence, 0);
  if (allocated > input.amountPence) {
    throw new AppError('You cannot allocate more than the payment amount.');
  }

  const [payment] = await db
    .insert(payments)
    .values({
      companyId: input.companyId,
      direction: input.direction,
      customerId: input.customerId ?? null,
      supplierId: input.supplierId ?? null,
      paymentDate: input.paymentDate,
      amountPence: input.amountPence,
      allocatedPence: allocated,
      method: input.method ?? 'bank_transfer',
      reference: input.reference ?? null,
      notes: input.notes ?? null,
      transactionId: input.transactionId ?? null,
      source: input.source ?? 'user',
      createdByUserId: input.userId ?? null,
    })
    .returning({ id: payments.id });

  if (!payment) throw new AppError('Could not record that payment.');

  if (allocations.length > 0) {
    await db.insert(paymentAllocations).values(
      allocations.map((allocation) => ({
        companyId: input.companyId,
        paymentId: payment.id,
        invoiceId: allocation.invoiceId ?? null,
        billId: allocation.billId ?? null,
        amountPence: allocation.amountPence,
        source: input.source ?? 'user',
      })),
    );
  }

  for (const allocation of allocations) {
    if (allocation.invoiceId) await refreshInvoiceStatus(db, input.companyId, allocation.invoiceId);
  }

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'payment.recorded',
    entityType: 'payment',
    entityId: payment.id,
    summary: `${formatMoney(input.amountPence)} ${input.direction === 'customer_receipt' ? 'received' : 'paid'} on ${input.paymentDate}.`,
    metadata: { allocations: allocations.length, transactionId: input.transactionId ?? null },
    source: input.source ?? 'user',
    actorUserId: input.userId,
  });

  return payment.id;
}

export async function allocatePayment(
  db: Database,
  companyId: string,
  paymentId: string,
  allocations: { invoiceId?: string; billId?: string; amountPence: Pence }[],
  userId: string,
  source: DecisionSource = 'user',
): Promise<void> {
  if (allocations.length === 0) return;

  const rows = await db
    .select()
    .from(payments)
    .where(and(eq(payments.companyId, companyId), eq(payments.id, paymentId)))
    .limit(1);
  const payment = rows[0];
  if (!payment) throw new NotFoundError('That payment could not be found.');

  const existing = await db
    .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amountPence}), 0)::bigint` })
    .from(paymentAllocations)
    .where(eq(paymentAllocations.paymentId, paymentId));
  const alreadyAllocated = Number(existing[0]?.total ?? 0);
  const adding = allocations.reduce((sum, a) => sum + a.amountPence, 0);

  if (alreadyAllocated + adding > payment.amountPence) {
    throw new AppError(
      `That would allocate ${formatMoney(alreadyAllocated + adding)} of a ${formatMoney(payment.amountPence)} payment.`,
    );
  }

  await db.insert(paymentAllocations).values(
    allocations.map((allocation) => ({
      companyId,
      paymentId,
      invoiceId: allocation.invoiceId ?? null,
      billId: allocation.billId ?? null,
      amountPence: allocation.amountPence,
      source,
    })),
  );

  await db
    .update(payments)
    .set({ allocatedPence: alreadyAllocated + adding, updatedAt: new Date() })
    .where(eq(payments.id, paymentId));

  for (const allocation of allocations) {
    if (allocation.invoiceId) await refreshInvoiceStatus(db, companyId, allocation.invoiceId);
  }

  await recordAudit(db, {
    companyId,
    action: 'payment.allocated',
    entityType: 'payment',
    entityId: paymentId,
    summary: `${formatMoney(adding)} allocated across ${allocations.length} document${allocations.length === 1 ? '' : 's'}.`,
    source,
    actorUserId: userId,
  });
}

export async function listOpenInvoicesForCustomer(db: Database, companyId: string, customerId: string) {
  return db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.customerId, customerId),
        sql`${invoices.status} in ('sent','part_paid','overdue')`,
      ),
    )
    .orderBy(invoices.dueDate);
}

export async function markOverdueInvoices(
  db: Database,
  companyId: string,
  today: IsoDate = todayIso(),
): Promise<number> {
  const rows = await db
    .update(invoices)
    .set({ status: 'overdue', updatedAt: new Date() })
    .where(
      and(
        eq(invoices.companyId, companyId),
        sql`${invoices.status} in ('sent','part_paid')`,
        sql`${invoices.dueDate} < ${today}`,
      ),
    )
    .returning({ id: invoices.id });
  return rows.length;
}

export async function transactionForPayment(db: Database, companyId: string, transactionId: string) {
  const rows = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), eq(transactions.id, transactionId)))
    .limit(1);
  return rows[0] ?? null;
}
