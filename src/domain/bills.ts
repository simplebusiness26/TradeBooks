import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { billLines, bills, categories, paymentAllocations, suppliers } from '@/db/schema';
import { AppError, NotFoundError, ValidationError } from '@/lib/errors';
import { addDays, todayIso, type IsoDate } from '@/lib/dates';
import { addPence, formatMoney, multiplyByMilliQuantity, roundHalfUpDiv, type Pence } from '@/lib/money';
import { ACCOUNTS, expenseAccountForGroup, postEntry, type JournalLineInput } from './ledger';
import { fromNet, rateFor, type VatTreatment } from './vat';
import { recordAudit } from './audit';

export type BillRow = typeof bills.$inferSelect;

export type BillLineInput = {
  description: string;
  quantityMilli: number;
  unitPricePence: Pence;
  vatTreatment: VatTreatment;
  categoryId?: string | null;
  jobId?: string | null;
  isLabour?: boolean;
};

export type CreateBillInput = {
  companyId: string;
  supplierId: string;
  billDate: IsoDate;
  dueDate?: IsoDate;
  reference?: string | null;
  description?: string | null;
  jobId?: string | null;
  lines: BillLineInput[];
  isSubcontractorPayment?: boolean;
  /** Overrides the deduction rate implied by the subcontractor's CIS status. */
  cisDeductionRateBasisPoints?: number | null;
  userId: string;
};

/** CIS deduction rates by verification status. */
export const CIS_RATES: Record<string, number> = {
  gross: 0,
  net_20: 2000,
  net_30: 3000,
  unknown: 3000,
};

export function calculateBillTotals(lines: BillLineInput[]) {
  const priced = lines.map((line) => {
    const net = multiplyByMilliQuantity(line.unitPricePence, line.quantityMilli);
    const amounts = fromNet(net, line.vatTreatment);
    return {
      ...line,
      netPence: amounts.net,
      vatPence: amounts.vat,
      grossPence: amounts.gross,
      rate: rateFor(line.vatTreatment),
    };
  });
  const netPence = addPence(...priced.map((l) => l.netPence));
  const vatPence = addPence(...priced.map((l) => l.vatPence));
  return { lines: priced, netPence, vatPence, grossPence: addPence(netPence, vatPence) };
}

/**
 * CIS deduction is calculated on the labour element only, excluding VAT and
 * excluding materials — the split the contractor must record for HMRC.
 */
export function calculateCisDeduction(input: {
  labourNetPence: Pence;
  rateBasisPoints: number;
}): Pence {
  if (input.rateBasisPoints <= 0) return 0;
  return roundHalfUpDiv(input.labourNetPence * input.rateBasisPoints, 10_000);
}

export async function nextBillNumber(db: Database, companyId: string): Promise<string> {
  const rows = await db
    .select({ number: bills.number })
    .from(bills)
    .where(eq(bills.companyId, companyId))
    .orderBy(desc(bills.createdAt))
    .limit(50);
  const highest = rows.reduce((max, row) => {
    const match = /(\d+)\s*$/.exec(row.number);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `BILL-${String(highest + 1).padStart(4, '0')}`;
}

export async function createBill(db: Database, input: CreateBillInput): Promise<BillRow> {
  if (input.lines.length === 0) {
    throw new ValidationError('Add at least one line to the bill.', { lines: ['Add at least one line.'] });
  }

  const supplierRows = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.companyId, input.companyId), eq(suppliers.id, input.supplierId)))
    .limit(1);
  const supplier = supplierRows[0];
  if (!supplier) throw new NotFoundError('That supplier could not be found.');

  const totals = calculateBillTotals(input.lines);
  const isSubcontractor = input.isSubcontractorPayment ?? supplier.isSubcontractor;
  const rate = isSubcontractor
    ? (input.cisDeductionRateBasisPoints ?? CIS_RATES[supplier.cisStatus] ?? 3000)
    : 0;

  const labourNet = addPence(...totals.lines.filter((l) => l.isLabour).map((l) => l.netPence));
  const materialsNet = addPence(...totals.lines.filter((l) => !l.isLabour).map((l) => l.netPence));
  const deduction = isSubcontractor
    ? calculateCisDeduction({ labourNetPence: labourNet, rateBasisPoints: rate })
    : 0;

  const number = await nextBillNumber(db, input.companyId);
  const dueDate = input.dueDate ?? addDays(input.billDate, 30);

  const [row] = await db
    .insert(bills)
    .values({
      companyId: input.companyId,
      supplierId: input.supplierId,
      number,
      reference: input.reference ?? null,
      status: 'awaiting_payment',
      billDate: input.billDate,
      dueDate,
      description: input.description ?? null,
      jobId: input.jobId ?? null,
      netPence: totals.netPence,
      vatPence: totals.vatPence,
      grossPence: totals.grossPence,
      isSubcontractorPayment: isSubcontractor,
      cisLabourPence: isSubcontractor ? labourNet : 0,
      cisMaterialsPence: isSubcontractor ? materialsNet : 0,
      cisDeductionPence: deduction,
      cisDeductionRateBasisPoints: isSubcontractor ? rate : null,
      createdByUserId: input.userId,
    })
    .returning();

  if (!row) throw new AppError('Could not create that bill.');

  await db.insert(billLines).values(
    totals.lines.map((line, index) => ({
      companyId: input.companyId,
      billId: row.id,
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
      isLabour: line.isLabour ?? false,
    })),
  );

  await postBillJournal(db, row);

  await recordAudit(db, {
    companyId: input.companyId,
    action: 'bill.created',
    entityType: 'bill',
    entityId: row.id,
    summary: `Bill ${number} from ${supplier.name}, ${formatMoney(totals.grossPence)}${
      deduction > 0 ? ` (CIS deduction ${formatMoney(deduction)})` : ''
    }.`,
    actorUserId: input.userId,
  });

  return row;
}

export async function getBill(db: Database, companyId: string, id: string): Promise<BillRow> {
  const rows = await db
    .select()
    .from(bills)
    .where(and(eq(bills.companyId, companyId), eq(bills.id, id)))
    .limit(1);
  const row = rows[0];
  if (!row) throw new NotFoundError('That bill could not be found.');
  return row;
}

export function billOutstandingPence(bill: BillRow): Pence {
  if (bill.status === 'void') return 0;
  return Math.max(0, bill.grossPence - bill.cisDeductionPence - bill.paidPence);
}

export async function refreshBillStatus(db: Database, companyId: string, billId: string): Promise<BillRow> {
  const bill = await getBill(db, companyId, billId);
  if (bill.status === 'void') return bill;

  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${paymentAllocations.amountPence}), 0)::bigint` })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.companyId, companyId), eq(paymentAllocations.billId, billId)));

  const paid = Number(rows[0]?.total ?? 0);
  const outstanding = bill.grossPence - bill.cisDeductionPence - paid;
  const status: BillRow['status'] = outstanding <= 0 ? 'paid' : paid > 0 ? 'part_paid' : 'awaiting_payment';

  const [updated] = await db
    .update(bills)
    .set({
      paidPence: paid,
      status,
      paidAt: status === 'paid' ? (bill.paidAt ?? new Date()) : null,
      updatedAt: new Date(),
    })
    .where(and(eq(bills.companyId, companyId), eq(bills.id, billId)))
    .returning();

  if (!updated) throw new NotFoundError('That bill could not be found.');
  return updated;
}

/**
 * Posts the purchase: expense and VAT debit, creditors credit, with the CIS
 * deduction held as a liability owed to HMRC rather than to the subcontractor.
 */
export async function postBillJournal(db: Database, bill: BillRow): Promise<void> {
  if (bill.status === 'void') {
    await postEntry(db, {
      companyId: bill.companyId,
      entryDate: bill.billDate,
      narrative: `Bill ${bill.number} cancelled`,
      sourceType: 'bill',
      sourceId: bill.id,
      postingKey: `bill:${bill.id}`,
      lines: [],
    });
    return;
  }

  const lines = await db.select().from(billLines).where(eq(billLines.billId, bill.id));
  const categoryRows = await db
    .select({ id: categories.id, ledgerAccountCode: categories.ledgerAccountCode, jobCostGroup: categories.jobCostGroup })
    .from(categories)
    .where(eq(categories.companyId, bill.companyId));
  const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

  const journalLines: JournalLineInput[] = [];

  for (const line of lines) {
    const category = line.categoryId ? categoryById.get(line.categoryId) : undefined;
    journalLines.push({
      accountCode:
        category?.ledgerAccountCode ??
        expenseAccountForGroup(line.isLabour ? 'labour' : (category?.jobCostGroup ?? 'none')),
      amountPence: line.netPence,
      categoryId: line.categoryId,
      jobId: line.jobId ?? bill.jobId,
      memo: line.description,
    });
  }

  if (bill.vatPence !== 0) {
    journalLines.push({
      accountCode: ACCOUNTS.VAT_CONTROL.code,
      amountPence: bill.vatPence,
      memo: 'VAT on purchases',
    });
  }

  if (bill.cisDeductionPence > 0) {
    journalLines.push({
      accountCode: ACCOUNTS.CIS_CONTROL.code,
      amountPence: -bill.cisDeductionPence,
      memo: 'CIS deducted from subcontractor',
    });
  }

  journalLines.push({
    accountCode: ACCOUNTS.CREDITORS.code,
    amountPence: -(bill.grossPence - bill.cisDeductionPence),
    memo: `Bill ${bill.number}`,
  });

  await postEntry(db, {
    companyId: bill.companyId,
    entryDate: bill.billDate,
    narrative: `Bill ${bill.number}`,
    sourceType: 'bill',
    sourceId: bill.id,
    postingKey: `bill:${bill.id}`,
    lines: journalLines,
  });
}

export async function voidBill(
  db: Database,
  companyId: string,
  billId: string,
  userId: string,
  reason: string,
): Promise<BillRow> {
  const bill = await getBill(db, companyId, billId);
  if (bill.paidPence > 0) throw new AppError('This bill has been paid. Record a refund instead.');
  const [updated] = await db
    .update(bills)
    .set({ status: 'void', voidedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bills.companyId, companyId), eq(bills.id, billId)))
    .returning();
  if (!updated) throw new NotFoundError('That bill could not be found.');
  await postBillJournal(db, updated);
  await recordAudit(db, {
    companyId,
    action: 'bill.voided',
    entityType: 'bill',
    entityId: billId,
    summary: `Bill ${bill.number} cancelled: ${reason}`,
    actorUserId: userId,
  });
  return updated;
}

export async function listUnpaidBills(db: Database, companyId: string, today: IsoDate = todayIso()) {
  const rows = await db
    .select({
      bill: bills,
      supplierName: suppliers.name,
    })
    .from(bills)
    .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
    .where(and(eq(bills.companyId, companyId), sql`${bills.status} in ('awaiting_payment','part_paid')`))
    .orderBy(bills.dueDate);

  return rows.map((row) => ({
    ...row.bill,
    supplierName: row.supplierName,
    outstandingPence: billOutstandingPence(row.bill),
    isOverdue: row.bill.dueDate < today,
  }));
}
