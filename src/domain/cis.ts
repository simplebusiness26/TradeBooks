import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { bills, cisPeriods, cisStatements, companies, suppliers } from '@/db/schema';
import { NotFoundError } from '@/lib/errors';
import { addPence, formatMoney, type Pence } from '@/lib/money';
import { cisPeriodFor, todayIso, type IsoDate } from '@/lib/dates';
import { recordAudit } from './audit';
import { CIS_RATES } from './bills';

export type CisSubcontractorLine = {
  supplierId: string;
  supplierName: string;
  utr: string | null;
  cisStatus: string;
  verificationNumber: string | null;
  verifiedAt: Date | null;
  grossPaidPence: Pence;
  materialsPence: Pence;
  labourPence: Pence;
  deductionRateBasisPoints: number;
  deductionPence: Pence;
  netPaidPence: Pence;
  billIds: string[];
  warnings: string[];
};

export type CisPeriodSummary = {
  start: IsoDate;
  end: IsoDate;
  label: string;
  dueDate: IsoDate;
  status: 'open' | 'in_review' | 'prepared' | 'closed' | 'filed';
  isContractor: boolean;
  lines: CisSubcontractorLine[];
  totals: {
    grossPaidPence: Pence;
    materialsPence: Pence;
    labourPence: Pence;
    deductionPence: Pence;
    netPaidPence: Pence;
    subcontractorCount: number;
  };
  warnings: { severity: 'high' | 'medium' | 'low'; message: string }[];
  readiness: { label: string; done: boolean; detail?: string }[];
};

/**
 * Builds a CIS monthly return position from the bills recorded against
 * subcontractors in the tax month.
 *
 * The deduction is calculated on the labour element only, after removing
 * VAT and materials — the split HMRC expects. Verification status drives the
 * rate: verified gross 0%, verified net 20%, unverified 30%.
 *
 * This is PREPARED data for review. TradeBooks does not submit CIS returns.
 */
export async function calculateCisPeriod(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
): Promise<CisPeriodSummary> {
  const companyRows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = companyRows[0];
  if (!company) throw new NotFoundError('That company could not be found.');

  const rows = await db
    .select({
      bill: bills,
      supplier: suppliers,
    })
    .from(bills)
    .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
    .where(
      and(
        eq(bills.companyId, companyId),
        eq(bills.isSubcontractorPayment, true),
        gte(bills.billDate, start),
        lte(bills.billDate, end),
        sql`${bills.status} <> 'void'`,
      ),
    )
    .orderBy(suppliers.name);

  const bySupplier = new Map<string, CisSubcontractorLine>();

  for (const { bill, supplier } of rows) {
    const existing = bySupplier.get(supplier.id);
    const line: CisSubcontractorLine = existing ?? {
      supplierId: supplier.id,
      supplierName: supplier.name,
      utr: supplier.utr,
      cisStatus: supplier.cisStatus,
      verificationNumber: supplier.cisVerificationNumber,
      verifiedAt: supplier.cisVerifiedAt,
      grossPaidPence: 0,
      materialsPence: 0,
      labourPence: 0,
      deductionRateBasisPoints: bill.cisDeductionRateBasisPoints ?? CIS_RATES[supplier.cisStatus] ?? 3000,
      deductionPence: 0,
      netPaidPence: 0,
      billIds: [],
      warnings: [],
    };

    line.grossPaidPence = addPence(line.grossPaidPence, bill.grossPence);
    line.materialsPence = addPence(line.materialsPence, bill.cisMaterialsPence);
    line.labourPence = addPence(line.labourPence, bill.cisLabourPence);
    line.deductionPence = addPence(line.deductionPence, bill.cisDeductionPence);
    line.billIds.push(bill.id);
    bySupplier.set(supplier.id, line);
  }

  const lines = [...bySupplier.values()].map((line) => {
    line.netPaidPence = line.grossPaidPence - line.deductionPence;
    if (!line.utr) line.warnings.push('No UTR recorded.');
    if (line.cisStatus === 'unknown') {
      line.warnings.push('Not verified with HMRC — deducted at the higher 30% rate.');
    }
    if (!line.verificationNumber && line.cisStatus !== 'unknown') {
      line.warnings.push('No verification number recorded.');
    }
    if (line.labourPence === 0 && line.grossPaidPence > 0) {
      line.warnings.push('No labour element recorded, so no deduction was calculated.');
    }
    return line;
  });

  const totals = {
    grossPaidPence: addPence(...lines.map((l) => l.grossPaidPence)),
    materialsPence: addPence(...lines.map((l) => l.materialsPence)),
    labourPence: addPence(...lines.map((l) => l.labourPence)),
    deductionPence: addPence(...lines.map((l) => l.deductionPence)),
    netPaidPence: addPence(...lines.map((l) => l.netPaidPence)),
    subcontractorCount: lines.length,
  };

  const warnings: { severity: 'high' | 'medium' | 'low'; message: string }[] = [];
  if (!company.cisContractor) {
    warnings.push({
      severity: 'medium',
      message: 'This business is not set up as a CIS contractor in Settings, so this is for information only.',
    });
  }
  const missingUtr = lines.filter((l) => !l.utr).length;
  if (missingUtr > 0) {
    warnings.push({
      severity: 'high',
      message: `${missingUtr} subcontractor${missingUtr === 1 ? ' has' : 's have'} no UTR recorded.`,
    });
  }
  const unverified = lines.filter((l) => l.cisStatus === 'unknown').length;
  if (unverified > 0) {
    warnings.push({
      severity: 'high',
      message: `${unverified} subcontractor${unverified === 1 ? ' is' : 's are'} unverified and deducted at 30%.`,
    });
  }

  const existing = await db
    .select()
    .from(cisPeriods)
    .where(
      and(eq(cisPeriods.companyId, companyId), eq(cisPeriods.startDate, start), eq(cisPeriods.endDate, end)),
    )
    .limit(1);

  const periodInfo = cisPeriodFor(end);

  return {
    start,
    end,
    label: existing[0]?.label ?? periodInfo.label,
    dueDate: existing[0]?.dueDate ?? periodInfo.due,
    status: existing[0]?.status ?? 'open',
    isContractor: company.cisContractor,
    lines,
    totals,
    warnings,
    readiness: [
      { label: 'All subcontractors have a UTR', done: missingUtr === 0, detail: missingUtr > 0 ? `${missingUtr} missing` : undefined },
      { label: 'All subcontractors verified with HMRC', done: unverified === 0, detail: unverified > 0 ? `${unverified} unverified` : undefined },
      { label: 'Labour and materials split recorded', done: lines.every((l) => l.labourPence > 0 || l.grossPaidPence === 0) },
      { label: 'Reviewed and prepared', done: (existing[0]?.status ?? 'open') === 'prepared' || existing[0]?.status === 'filed' },
    ],
  };
}

export async function currentCisPeriod(
  db: Database,
  companyId: string,
  today: IsoDate = todayIso(),
): Promise<CisPeriodSummary> {
  const period = cisPeriodFor(today);
  return calculateCisPeriod(db, companyId, period.start, period.end);
}

/** Freezes the period and writes a statement per subcontractor. */
export async function prepareCisPeriod(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
  userId: string,
): Promise<void> {
  const summary = await calculateCisPeriod(db, companyId, start, end);

  const [period] = await db
    .insert(cisPeriods)
    .values({
      companyId,
      label: summary.label,
      startDate: start,
      endDate: end,
      dueDate: summary.dueDate,
      status: 'prepared',
      totalLabourPence: summary.totals.labourPence,
      totalMaterialsPence: summary.totals.materialsPence,
      totalDeductionPence: summary.totals.deductionPence,
      subcontractorCount: summary.totals.subcontractorCount,
      snapshot: { totals: summary.totals, warnings: summary.warnings },
      preparedAt: new Date(),
      preparedByUserId: userId,
    })
    .onConflictDoUpdate({
      target: [cisPeriods.companyId, cisPeriods.startDate, cisPeriods.endDate],
      set: {
        status: 'prepared',
        totalLabourPence: summary.totals.labourPence,
        totalMaterialsPence: summary.totals.materialsPence,
        totalDeductionPence: summary.totals.deductionPence,
        subcontractorCount: summary.totals.subcontractorCount,
        snapshot: { totals: summary.totals, warnings: summary.warnings },
        preparedAt: new Date(),
        preparedByUserId: userId,
        updatedAt: new Date(),
      },
    })
    .returning({ id: cisPeriods.id });

  if (!period) throw new Error('Could not prepare the CIS period');

  await db.delete(cisStatements).where(eq(cisStatements.periodId, period.id));
  if (summary.lines.length > 0) {
    await db.insert(cisStatements).values(
      summary.lines.map((line) => ({
        companyId,
        periodId: period.id,
        supplierId: line.supplierId,
        grossPaidPence: line.grossPaidPence,
        materialsPence: line.materialsPence,
        labourPence: line.labourPence,
        deductionRateBasisPoints: line.deductionRateBasisPoints,
        deductionPence: line.deductionPence,
        netPaidPence: line.netPaidPence,
        billIds: line.billIds,
        warnings: line.warnings,
      })),
    );
  }

  await db
    .update(bills)
    .set({ cisPeriodId: period.id })
    .where(
      and(
        eq(bills.companyId, companyId),
        eq(bills.isSubcontractorPayment, true),
        gte(bills.billDate, start),
        lte(bills.billDate, end),
      ),
    );

  await recordAudit(db, {
    companyId,
    action: 'cis.prepared',
    entityType: 'cis_period',
    entityId: period.id,
    summary: `CIS period ${summary.label} prepared: ${summary.totals.subcontractorCount} subcontractor${summary.totals.subcontractorCount === 1 ? '' : 's'}, ${formatMoney(summary.totals.deductionPence)} deducted.`,
    metadata: { start, end, totals: summary.totals },
    actorUserId: userId,
  });
}

export async function recordCisFiled(
  db: Database,
  companyId: string,
  start: IsoDate,
  end: IsoDate,
  reference: string,
  userId: string,
): Promise<void> {
  await db
    .update(cisPeriods)
    .set({ status: 'filed', filedAt: new Date(), filedReference: reference, updatedAt: new Date() })
    .where(
      and(eq(cisPeriods.companyId, companyId), eq(cisPeriods.startDate, start), eq(cisPeriods.endDate, end)),
    );

  await recordAudit(db, {
    companyId,
    action: 'cis.marked_filed',
    entityType: 'cis_period',
    summary: `CIS period ${start} to ${end} marked as filed with HMRC outside TradeBooks (reference ${reference}).`,
    actorUserId: userId,
  });
}

export async function listCisPeriods(db: Database, companyId: string) {
  return db
    .select()
    .from(cisPeriods)
    .where(eq(cisPeriods.companyId, companyId))
    .orderBy(sql`${cisPeriods.endDate} desc`);
}

export async function listSubcontractors(db: Database, companyId: string) {
  return db
    .select()
    .from(suppliers)
    .where(
      and(
        eq(suppliers.companyId, companyId),
        eq(suppliers.isSubcontractor, true),
        eq(suppliers.isArchived, false),
      ),
    )
    .orderBy(suppliers.name);
}
