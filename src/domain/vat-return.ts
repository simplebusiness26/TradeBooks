import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { billLines, bills, companies, documents, invoices, transactions, vatPeriods } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';
import { addPence, subPence, type Pence } from '@/lib/money';
import { vatPeriodFor, todayIso, type IsoDate } from '@/lib/dates';
import { recordAudit } from './audit';

export type VatBoxes = {
  /** Box 1 — VAT due on sales. */
  vatDueSales: Pence;
  /** Box 2 — VAT due on acquisitions (kept at zero; not used by V1). */
  vatDueAcquisitions: Pence;
  /** Box 3 — total VAT due. */
  totalVatDue: Pence;
  /** Box 4 — VAT reclaimed on purchases. */
  vatReclaimed: Pence;
  /** Box 5 — net VAT to pay (positive) or reclaim (negative). */
  netVatDue: Pence;
  /** Box 6 — total value of sales excluding VAT. */
  totalSalesExVat: Pence;
  /** Box 7 — total value of purchases excluding VAT. */
  totalPurchasesExVat: Pence;
};

export type VatWarning = { severity: 'high' | 'medium' | 'low'; message: string; count?: number };

export type VatPeriodSummary = {
  start: IsoDate;
  end: IsoDate;
  label: string;
  dueDate: IsoDate;
  registered: boolean;
  scheme: string;
  boxes: VatBoxes;
  /** True while any figure could still change — always true before preparation. */
  isEstimate: boolean;
  status: 'open' | 'in_review' | 'prepared' | 'closed' | 'filed';
  warnings: VatWarning[];
  readiness: { label: string; done: boolean; detail?: string }[];
  counts: {
    salesInvoices: number;
    purchaseBills: number;
    transactionsWithVat: number;
    uncategorisedTransactions: number;
    missingReceipts: number;
    openQuestions: number;
  };
};

/**
 * Builds the VAT position for a period from the canonical records.
 *
 * These figures are an ESTIMATE prepared from the bookkeeping records. They
 * are not a filed return and TradeBooks does not submit anything to HMRC.
 *
 * Domestic reverse charge (common in construction) is included in both Box 1
 * and Box 4 for purchases, which is how the customer accounts for it; the net
 * effect on Box 5 is nil, and the values still appear so the return is
 * complete.
 */
export async function calculateVatPeriod(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
): Promise<VatPeriodSummary> {
  const companyRows = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const company = companyRows[0];
  if (!company) throw new NotFoundError('That company could not be found.');

  const period = vatPeriodFor(end, company.vatPeriodMonths, company.vatFirstPeriodEnd);

  // --- Box 1 / Box 6: sales -------------------------------------------------
  const salesRows = await db
    .select({
      vat: sql<number>`coalesce(sum(${invoices.vatPence}), 0)::bigint`,
      net: sql<number>`coalesce(sum(${invoices.netPence}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        gte(invoices.issueDate, start),
        lte(invoices.issueDate, end),
        sql`${invoices.status} not in ('draft','void')`,
      ),
    );

  // Money in recorded straight on the bank without an invoice.
  const salesTransactionRows = await db
    .select({
      vat: sql<number>`coalesce(sum(coalesce(${transactions.vatPence}, 0)), 0)::bigint`,
      net: sql<number>`coalesce(sum(coalesce(${transactions.netPence}, ${transactions.amountPence})), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.direction, 'money_in'),
        eq(transactions.isPersonal, false),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
        sql`${transactions.status} <> 'excluded'`,
        sql`${transactions.vatTreatment} not in ('outside_scope','no_vat')`,
        sql`not exists (select 1 from transaction_links tl where tl.transaction_id = ${transactions.id} and tl.linked_type in ('invoice','payment'))`,
      ),
    );

  // --- Box 4 / Box 7: purchases --------------------------------------------
  const purchaseRows = await db
    .select({
      vat: sql<number>`coalesce(sum(${bills.vatPence}), 0)::bigint`,
      net: sql<number>`coalesce(sum(${bills.netPence}), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(bills)
    .where(
      and(
        eq(bills.companyId, companyId),
        gte(bills.billDate, start),
        lte(bills.billDate, end),
        sql`${bills.status} <> 'void'`,
      ),
    );

  const purchaseTransactionRows = await db
    .select({
      vat: sql<number>`coalesce(sum(coalesce(${transactions.vatPence}, 0)), 0)::bigint`,
      net: sql<number>`coalesce(sum(coalesce(${transactions.netPence}, ${transactions.amountPence})), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.direction, 'money_out'),
        eq(transactions.isPersonal, false),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
        sql`${transactions.status} <> 'excluded'`,
        sql`${transactions.vatTreatment} not in ('outside_scope','no_vat')`,
        sql`not exists (select 1 from transaction_links tl where tl.transaction_id = ${transactions.id} and tl.linked_type = 'bill')`,
      ),
    );

  // Reverse-charge purchases: output VAT the buyer must declare in Box 1.
  const reverseChargeRows = await db
    .select({ net: sql<number>`coalesce(sum(${billLines.netPence}), 0)::bigint` })
    .from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .where(
      and(
        eq(billLines.companyId, companyId),
        eq(billLines.vatTreatment, 'reverse_charge'),
        gte(bills.billDate, start),
        lte(bills.billDate, end),
        sql`${bills.status} <> 'void'`,
      ),
    );

  const reverseChargeNet = Number(reverseChargeRows[0]?.net ?? 0);
  const reverseChargeVat = Math.round((reverseChargeNet * 2000) / 10_000);

  const vatDueSales = addPence(
    Number(salesRows[0]?.vat ?? 0),
    Number(salesTransactionRows[0]?.vat ?? 0),
    reverseChargeVat,
  );
  const vatReclaimed = addPence(
    Number(purchaseRows[0]?.vat ?? 0),
    Number(purchaseTransactionRows[0]?.vat ?? 0),
    reverseChargeVat,
  );

  const boxes: VatBoxes = {
    vatDueSales,
    vatDueAcquisitions: 0,
    totalVatDue: vatDueSales,
    vatReclaimed,
    netVatDue: subPence(vatDueSales, vatReclaimed),
    totalSalesExVat: addPence(Number(salesRows[0]?.net ?? 0), Number(salesTransactionRows[0]?.net ?? 0)),
    totalPurchasesExVat: addPence(
      Number(purchaseRows[0]?.net ?? 0),
      Number(purchaseTransactionRows[0]?.net ?? 0),
    ),
  };

  // --- Evidence and readiness ----------------------------------------------
  const uncategorisedRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
        sql`${transactions.categoryId} is null`,
        sql`${transactions.status} <> 'excluded'`,
      ),
    );

  const missingReceiptRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.needsReceipt, true),
        gte(transactions.transactionDate, start),
        lte(transactions.transactionDate, end),
        sql`not exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
      ),
    );

  const openQuestionRows = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from exceptions where company_id = ${companyId} and status = 'open'`,
  );

  const uncategorised = uncategorisedRows[0]?.value ?? 0;
  const missingReceipts = missingReceiptRows[0]?.value ?? 0;
  const openQuestions = Number((openQuestionRows as unknown as { count: number }[])[0]?.count ?? 0);

  const warnings: VatWarning[] = [];
  if (!company.vatRegistered) {
    warnings.push({
      severity: 'high',
      message: 'This business is not marked as VAT registered, so these figures are for information only.',
    });
  }
  if (uncategorised > 0) {
    warnings.push({
      severity: 'high',
      message: `${uncategorised} payment${uncategorised === 1 ? ' has' : 's have'} no category yet, so VAT may be missing.`,
      count: uncategorised,
    });
  }
  if (missingReceipts > 0) {
    warnings.push({
      severity: 'medium',
      message: `${missingReceipts} purchase${missingReceipts === 1 ? '' : 's'} without a receipt. VAT can only be reclaimed with evidence.`,
      count: missingReceipts,
    });
  }
  if (openQuestions > 0) {
    warnings.push({
      severity: 'medium',
      message: `${openQuestions} question${openQuestions === 1 ? '' : 's'} waiting in Ask Me.`,
      count: openQuestions,
    });
  }

  const existing = await db
    .select()
    .from(vatPeriods)
    .where(
      and(eq(vatPeriods.companyId, companyId), eq(vatPeriods.startDate, start), eq(vatPeriods.endDate, end)),
    )
    .limit(1);

  const status = existing[0]?.status ?? 'open';

  return {
    start,
    end,
    label: period.label,
    dueDate: existing[0]?.dueDate ?? period.due,
    registered: company.vatRegistered,
    scheme: company.vatScheme,
    boxes,
    isEstimate: status !== 'filed',
    status,
    warnings,
    readiness: [
      {
        label: 'Every payment has a category',
        done: uncategorised === 0,
        detail: uncategorised > 0 ? `${uncategorised} still to sort` : undefined,
      },
      {
        label: 'Receipts collected for purchases',
        done: missingReceipts === 0,
        detail: missingReceipts > 0 ? `${missingReceipts} missing` : undefined,
      },
      { label: 'No questions waiting', done: openQuestions === 0 },
      { label: 'Sales invoices recorded', done: Number(salesRows[0]?.count ?? 0) > 0 },
      { label: 'Reviewed and prepared', done: status === 'prepared' || status === 'filed' },
    ],
    counts: {
      salesInvoices: Number(salesRows[0]?.count ?? 0),
      purchaseBills: Number(purchaseRows[0]?.count ?? 0),
      transactionsWithVat: Number(purchaseTransactionRows[0]?.count ?? 0),
      uncategorisedTransactions: uncategorised,
      missingReceipts,
      openQuestions,
    },
  };
}

export async function currentVatPeriod(
  db: Database,
  companyId: string,
  today: IsoDate = todayIso(),
): Promise<VatPeriodSummary> {
  const companyRows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = companyRows[0];
  if (!company) throw new NotFoundError('That company could not be found.');
  const period = vatPeriodFor(today, company.vatPeriodMonths, company.vatFirstPeriodEnd);
  return calculateVatPeriod(db, companyId, period.start, period.end);
}

/** Freezes the figures and records who prepared them. Still not a filed return. */
export async function prepareVatPeriod(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
  userId: string,
): Promise<void> {
  const summary = await calculateVatPeriod(db, companyId, start, end);

  await db
    .insert(vatPeriods)
    .values({
      companyId,
      label: summary.label,
      startDate: start,
      endDate: end,
      dueDate: summary.dueDate,
      status: 'prepared',
      vatDueSalesPence: summary.boxes.vatDueSales,
      vatReclaimedPence: summary.boxes.vatReclaimed,
      netVatDuePence: summary.boxes.netVatDue,
      totalSalesExVatPence: summary.boxes.totalSalesExVat,
      totalPurchasesExVatPence: summary.boxes.totalPurchasesExVat,
      snapshot: { boxes: summary.boxes, counts: summary.counts, warnings: summary.warnings },
      preparedAt: new Date(),
      preparedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [vatPeriods.companyId, vatPeriods.startDate, vatPeriods.endDate],
      set: {
        status: 'prepared',
        vatDueSalesPence: summary.boxes.vatDueSales,
        vatReclaimedPence: summary.boxes.vatReclaimed,
        netVatDuePence: summary.boxes.netVatDue,
        totalSalesExVatPence: summary.boxes.totalSalesExVat,
        totalPurchasesExVatPence: summary.boxes.totalPurchasesExVat,
        snapshot: { boxes: summary.boxes, counts: summary.counts, warnings: summary.warnings },
        preparedAt: new Date(),
        preparedByUserId: userId,
        updatedAt: new Date(),
      },
    });

  await recordAudit(db, {
    companyId,
    action: 'vat.prepared',
    entityType: 'vat_period',
    entityId: null,
    summary: `VAT period ${summary.label} prepared for review. Net position ${summary.boxes.netVatDue >= 0 ? 'payable' : 'repayable'}.`,
    metadata: { start, end, boxes: summary.boxes },
    actorUserId: userId,
  });
}

/**
 * Records that the return was filed elsewhere (by the owner or their
 * accountant). TradeBooks never files on anyone's behalf.
 */
export async function recordVatFiled(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
  reference: string,
  userId: string,
): Promise<void> {
  await db
    .update(vatPeriods)
    .set({ status: 'filed', filedAt: new Date(), filedReference: reference, filedByUserId: userId, updatedAt: new Date() })
    .where(
      and(eq(vatPeriods.companyId, companyId), eq(vatPeriods.startDate, start), eq(vatPeriods.endDate, end)),
    );

  await recordAudit(db, {
    companyId,
    action: 'vat.marked_filed',
    entityType: 'vat_period',
    summary: `VAT period ${start} to ${end} marked as filed with HMRC outside TradeBooks (reference ${reference}).`,
    actorUserId: userId,
  });
}

export async function listVatPeriods(db: Database, companyId: string) {
  return db
    .select()
    .from(vatPeriods)
    .where(eq(vatPeriods.companyId, companyId))
    .orderBy(sql`${vatPeriods.endDate} desc`);
}
