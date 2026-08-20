import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  billLines,
  bills,
  categories,
  customers,
  documents,
  invoiceLines,
  invoices,
  jobs,
  suppliers,
  transactions,
} from '@/db/schema';
import { NotFoundError } from '@/lib/errors';
import { addPence, subPence, type Pence } from '@/lib/money';

export type JobRow = typeof jobs.$inferSelect;

export type JobCostBreakdown = {
  materialsPence: Pence;
  labourPence: Pence;
  otherPence: Pence;
  totalPence: Pence;
};

export type JobProfitability = {
  job: JobRow;
  customerName: string | null;
  /** Invoiced revenue excluding VAT — VAT is never profit. */
  invoicedNetPence: Pence;
  invoicedGrossPence: Pence;
  receivedPence: Pence;
  outstandingPence: Pence;
  quotedRevenuePence: Pence;
  costs: JobCostBreakdown;
  /** Costs recorded on bills. */
  billCostsPence: Pence;
  /** Costs recorded directly against bank transactions. */
  transactionCostsPence: Pence;
  grossProfitPence: Pence;
  /** Margin in basis points of net revenue; null when there is no revenue yet. */
  marginBasisPoints: number | null;
  vsQuotePence: Pence | null;
  linkedDocumentCount: number;
  linkedTransactionCount: number;
  /** Costs the owner has not attributed to any job — shown so they are not forgotten. */
  warnings: string[];
};

/**
 * Job profit is calculated from the canonical records only:
 *   revenue  = net (VAT-exclusive) value of invoice lines assigned to the job
 *   costs    = net value of bill lines + net value of transactions on the job
 *   profit   = revenue − costs
 *
 * Transactions that are already covered by a bill are excluded so a cost is
 * never counted twice.
 */
export async function calculateJobProfitability(
  db: Database,
  companyId: string,
  jobId: string,
): Promise<JobProfitability> {
  const jobRows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), eq(jobs.id, jobId)))
    .limit(1);
  const job = jobRows[0];
  if (!job) throw new NotFoundError('That job could not be found.');

  const customerName = job.customerId
    ? ((
        await db
          .select({ name: customers.name })
          .from(customers)
          .where(eq(customers.id, job.customerId))
          .limit(1)
      )[0]?.name ?? null)
    : null;

  const revenueRows = await db
    .select({
      net: sql<number>`coalesce(sum(${invoiceLines.netPence}), 0)::bigint`,
      gross: sql<number>`coalesce(sum(${invoiceLines.grossPence}), 0)::bigint`,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(
      and(
        eq(invoiceLines.companyId, companyId),
        eq(invoiceLines.jobId, jobId),
        sql`${invoices.status} <> 'void'`,
      ),
    );

  const invoicedNetPence = Number(revenueRows[0]?.net ?? 0);
  const invoicedGrossPence = Number(revenueRows[0]?.gross ?? 0);

  const paymentRows = await db
    .select({
      paid: sql<number>`coalesce(sum(${invoices.paidPence}), 0)::bigint`,
      billed: sql<number>`coalesce(sum(${invoices.grossPence} - ${invoices.cisDeductionPence}), 0)::bigint`,
    })
    .from(invoices)
    .where(
      and(eq(invoices.companyId, companyId), eq(invoices.jobId, jobId), sql`${invoices.status} <> 'void'`),
    );
  const receivedPence = Number(paymentRows[0]?.paid ?? 0);
  const outstandingPence = Math.max(0, Number(paymentRows[0]?.billed ?? 0) - receivedPence);

  const billCostRows = await db
    .select({
      group: sql<string>`coalesce(${categories.jobCostGroup}, case when ${billLines.isLabour} then 'labour' else 'other' end)`,
      net: sql<number>`coalesce(sum(${billLines.netPence}), 0)::bigint`,
    })
    .from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .leftJoin(categories, eq(categories.id, billLines.categoryId))
    .where(
      and(eq(billLines.companyId, companyId), eq(billLines.jobId, jobId), sql`${bills.status} <> 'void'`),
    )
    .groupBy(sql`1`);

  const transactionCostRows = await db
    .select({
      group: sql<string>`coalesce(${categories.jobCostGroup}, 'other')`,
      net: sql<number>`coalesce(sum(coalesce(${transactions.netPence}, ${transactions.amountPence})), 0)::bigint`,
    })
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.jobId, jobId),
        eq(transactions.direction, 'money_out'),
        eq(transactions.isPersonal, false),
        sql`${transactions.status} <> 'excluded'`,
        // Skip transactions that just settle a bill; the bill already holds the cost.
        sql`not exists (select 1 from transaction_links tl where tl.transaction_id = ${transactions.id} and tl.linked_type = 'bill')`,
      ),
    )
    .groupBy(sql`1`);

  const costs: JobCostBreakdown = { materialsPence: 0, labourPence: 0, otherPence: 0, totalPence: 0 };
  let billCostsPence = 0;
  let transactionCostsPence = 0;

  for (const row of billCostRows) {
    const value = Number(row.net);
    billCostsPence += value;
    addToGroup(costs, row.group, value);
  }
  for (const row of transactionCostRows) {
    const value = Number(row.net);
    transactionCostsPence += value;
    addToGroup(costs, row.group, value);
  }
  costs.totalPence = addPence(costs.materialsPence, costs.labourPence, costs.otherPence);

  const grossProfitPence = subPence(invoicedNetPence, costs.totalPence);
  const marginBasisPoints =
    invoicedNetPence > 0 ? Math.round((grossProfitPence / invoicedNetPence) * 10_000) : null;

  const documentCountRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), eq(documents.jobId, jobId)));

  const transactionCountRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), eq(transactions.jobId, jobId)));

  const warnings: string[] = [];
  if (invoicedNetPence === 0 && costs.totalPence > 0) {
    warnings.push('Costs are recorded but nothing has been invoiced yet.');
  }
  if (job.quotedRevenuePence > 0 && invoicedNetPence > 0 && invoicedNetPence < job.quotedRevenuePence * 0.9) {
    warnings.push('Invoiced less than quoted so far.');
  }

  return {
    job,
    customerName,
    invoicedNetPence,
    invoicedGrossPence,
    receivedPence,
    outstandingPence,
    quotedRevenuePence: job.quotedRevenuePence,
    costs,
    billCostsPence,
    transactionCostsPence,
    grossProfitPence,
    marginBasisPoints,
    vsQuotePence: job.quotedRevenuePence > 0 ? subPence(invoicedNetPence, job.quotedRevenuePence) : null,
    linkedDocumentCount: documentCountRows[0]?.value ?? 0,
    linkedTransactionCount: transactionCountRows[0]?.value ?? 0,
    warnings,
  };
}

function addToGroup(costs: JobCostBreakdown, group: string, value: Pence): void {
  switch (group) {
    case 'materials':
      costs.materialsPence += value;
      break;
    case 'labour':
      costs.labourPence += value;
      break;
    default:
      costs.otherPence += value;
  }
}

export type JobSummary = {
  id: string;
  reference: string;
  name: string;
  status: JobRow['status'];
  customerName: string | null;
  invoicedNetPence: Pence;
  costsPence: Pence;
  profitPence: Pence;
  marginBasisPoints: number | null;
};

/** Lightweight list view: one query set for all jobs rather than N+1. */
export async function listJobSummaries(db: Database, companyId: string): Promise<JobSummary[]> {
  const jobRows = await db
    .select({ job: jobs, customerName: customers.name })
    .from(jobs)
    .leftJoin(customers, eq(customers.id, jobs.customerId))
    .where(and(eq(jobs.companyId, companyId), eq(jobs.isArchived, false)))
    .orderBy(jobs.reference);

  const revenue = await db
    .select({
      jobId: invoiceLines.jobId,
      net: sql<number>`coalesce(sum(${invoiceLines.netPence}), 0)::bigint`,
    })
    .from(invoiceLines)
    .innerJoin(invoices, eq(invoices.id, invoiceLines.invoiceId))
    .where(and(eq(invoiceLines.companyId, companyId), sql`${invoices.status} <> 'void'`))
    .groupBy(invoiceLines.jobId);

  const billCosts = await db
    .select({
      jobId: billLines.jobId,
      net: sql<number>`coalesce(sum(${billLines.netPence}), 0)::bigint`,
    })
    .from(billLines)
    .innerJoin(bills, eq(bills.id, billLines.billId))
    .where(and(eq(billLines.companyId, companyId), sql`${bills.status} <> 'void'`))
    .groupBy(billLines.jobId);

  const transactionCosts = await db
    .select({
      jobId: transactions.jobId,
      net: sql<number>`coalesce(sum(coalesce(${transactions.netPence}, ${transactions.amountPence})), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.direction, 'money_out'),
        eq(transactions.isPersonal, false),
        sql`${transactions.status} <> 'excluded'`,
        sql`not exists (select 1 from transaction_links tl where tl.transaction_id = ${transactions.id} and tl.linked_type = 'bill')`,
      ),
    )
    .groupBy(transactions.jobId);

  const revenueByJob = new Map(revenue.map((r) => [r.jobId, Number(r.net)]));
  const costByJob = new Map<string, number>();
  for (const row of [...billCosts, ...transactionCosts]) {
    if (!row.jobId) continue;
    costByJob.set(row.jobId, (costByJob.get(row.jobId) ?? 0) + Number(row.net));
  }

  return jobRows.map(({ job, customerName }) => {
    const invoicedNetPence = revenueByJob.get(job.id) ?? 0;
    const costsPence = costByJob.get(job.id) ?? 0;
    const profitPence = invoicedNetPence - costsPence;
    return {
      id: job.id,
      reference: job.reference,
      name: job.name,
      status: job.status,
      customerName,
      invoicedNetPence,
      costsPence,
      profitPence,
      marginBasisPoints:
        invoicedNetPence > 0 ? Math.round((profitPence / invoicedNetPence) * 10_000) : null,
    };
  });
}

/** Costs with no job attached, so unallocated spend stays visible. */
export async function unallocatedJobCosts(db: Database, companyId: string) {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(coalesce(${transactions.netPence}, ${transactions.amountPence})), 0)::bigint`,
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .innerJoin(categories, eq(categories.id, transactions.categoryId))
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.direction, 'money_out'),
        eq(transactions.isPersonal, false),
        eq(categories.isJobCost, true),
        sql`${transactions.jobId} is null`,
        sql`${transactions.status} <> 'excluded'`,
      ),
    );
  return { totalPence: Number(rows[0]?.total ?? 0), count: rows[0]?.count ?? 0 };
}

export function formatMarginPercent(basisPoints: number | null): string {
  if (basisPoints === null) return '—';
  return `${(basisPoints / 100).toFixed(1)}%`;
}

export async function supplierList(db: Database, companyId: string) {
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.isArchived, false)))
    .orderBy(suppliers.name);
}
