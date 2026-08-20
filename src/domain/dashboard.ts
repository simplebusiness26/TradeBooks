import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  bankAccounts,
  bills,
  documents,
  exceptions,
  invoices,
  transactions,
} from '@/db/schema';
import { addPence, subPence, type Pence } from '@/lib/money';
import {
  endOfMonth,
  formatMonthYear,
  startOfMonth,
  todayIso,
  type IsoDate,
} from '@/lib/dates';
import { currentVatPeriod, type VatPeriodSummary } from './vat-return';
import { currentCisPeriod } from './cis';

export type DashboardDeadline = {
  label: string;
  detail: string;
  dueDate: IsoDate;
  kind: 'vat' | 'cis' | 'invoice';
};

export type DashboardSummary = {
  today: IsoDate;
  cash: {
    totalPence: Pence;
    accounts: { id: string; name: string; balancePence: Pence; lastTransactionDate: IsoDate | null }[];
    /** True when a balance is derived from opening balance plus recorded movements. */
    derived: boolean;
  };
  owedToYou: { totalPence: Pence; overduePence: Pence; count: number; overdueCount: number };
  billsToPay: { totalPence: Pence; overduePence: Pence; count: number; overdueCount: number };
  month: {
    label: string;
    start: IsoDate;
    end: IsoDate;
    incomePence: Pence;
    costsPence: Pence;
    profitPence: Pence;
  };
  vat: {
    registered: boolean;
    label: string;
    netVatDuePence: Pence;
    dueDate: IsoDate;
    isEstimate: boolean;
  };
  askMe: { openCount: number; topQuestion: string | null };
  receipts: { missingCount: number; unmatchedCount: number };
  deadlines: DashboardDeadline[];
};

/**
 * Every figure on the owner dashboard is derived here from the canonical
 * records, so the numbers on screen can always be traced to a transaction,
 * an invoice or a bill.
 */
export async function buildDashboard(
  db: Database,
  companyId: string,
  today: IsoDate = todayIso(),
): Promise<DashboardSummary> {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);

  const accounts = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isArchived, false)))
    .orderBy(bankAccounts.name);

  const movements = await db
    .select({
      bankAccountId: transactions.bankAccountId,
      inflow: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_in' then ${transactions.amountPence} else 0 end), 0)::bigint`,
      outflow: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_out' then ${transactions.amountPence} else 0 end), 0)::bigint`,
      lastDate: sql<string | null>`max(${transactions.transactionDate})`,
    })
    .from(transactions)
    .where(and(eq(transactions.companyId, companyId), sql`${transactions.status} <> 'excluded'`))
    .groupBy(transactions.bankAccountId);

  const movementByAccount = new Map(movements.map((m) => [m.bankAccountId, m]));

  const accountBalances = accounts.map((account) => {
    const movement = movementByAccount.get(account.id);
    const balance =
      account.openingBalancePence + Number(movement?.inflow ?? 0) - Number(movement?.outflow ?? 0);
    return {
      id: account.id,
      name: account.name,
      balancePence: balance,
      lastTransactionDate: movement?.lastDate ?? null,
    };
  });

  const cashTotal = addPence(...accountBalances.map((a) => a.balancePence));

  const owedRows = await db
    .select({
      total: sql<number>`coalesce(sum(${invoices.grossPence} - ${invoices.cisDeductionPence} - ${invoices.paidPence}), 0)::bigint`,
      overdue: sql<number>`coalesce(sum(case when ${invoices.dueDate} < ${today} then ${invoices.grossPence} - ${invoices.cisDeductionPence} - ${invoices.paidPence} else 0 end), 0)::bigint`,
      count: sql<number>`count(*)::int`,
      overdueCount: sql<number>`count(*) filter (where ${invoices.dueDate} < ${today})::int`,
    })
    .from(invoices)
    .where(
      and(eq(invoices.companyId, companyId), sql`${invoices.status} in ('sent','part_paid','overdue')`),
    );

  const billRows = await db
    .select({
      total: sql<number>`coalesce(sum(${bills.grossPence} - ${bills.cisDeductionPence} - ${bills.paidPence}), 0)::bigint`,
      overdue: sql<number>`coalesce(sum(case when ${bills.dueDate} < ${today} then ${bills.grossPence} - ${bills.cisDeductionPence} - ${bills.paidPence} else 0 end), 0)::bigint`,
      count: sql<number>`count(*)::int`,
      overdueCount: sql<number>`count(*) filter (where ${bills.dueDate} < ${today})::int`,
    })
    .from(bills)
    .where(and(eq(bills.companyId, companyId), sql`${bills.status} in ('awaiting_payment','part_paid')`));

  const monthRows = await db
    .select({
      income: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_in' then coalesce(${transactions.netPence}, ${transactions.amountPence}) else 0 end), 0)::bigint`,
      costs: sql<number>`coalesce(sum(case when ${transactions.direction} = 'money_out' then coalesce(${transactions.netPence}, ${transactions.amountPence}) else 0 end), 0)::bigint`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.isPersonal, false),
        gte(transactions.transactionDate, monthStart),
        lte(transactions.transactionDate, monthEnd),
        sql`${transactions.status} <> 'excluded'`,
      ),
    );

  const askRows = await db
    .select({
      count: sql<number>`count(*)::int`,
      top: sql<string | null>`(array_agg(${exceptions.question} order by ${exceptions.priority}, ${exceptions.createdAt}))[1]`,
    })
    .from(exceptions)
    .where(and(eq(exceptions.companyId, companyId), eq(exceptions.status, 'open')));

  const missingReceiptRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(transactions)
    .where(
      and(
        eq(transactions.companyId, companyId),
        eq(transactions.needsReceipt, true),
        sql`not exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
      ),
    );

  const unmatchedReceiptRows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.companyId, companyId), sql`${documents.matchedTransactionId} is null`));

  const vat = await currentVatPeriod(db, companyId, today);
  const deadlines = await buildDeadlines(db, companyId, today, vat);

  const incomePence = Number(monthRows[0]?.income ?? 0);
  const costsPence = Number(monthRows[0]?.costs ?? 0);

  return {
    today,
    cash: { totalPence: cashTotal, accounts: accountBalances, derived: true },
    owedToYou: {
      totalPence: Number(owedRows[0]?.total ?? 0),
      overduePence: Number(owedRows[0]?.overdue ?? 0),
      count: Number(owedRows[0]?.count ?? 0),
      overdueCount: Number(owedRows[0]?.overdueCount ?? 0),
    },
    billsToPay: {
      totalPence: Number(billRows[0]?.total ?? 0),
      overduePence: Number(billRows[0]?.overdue ?? 0),
      count: Number(billRows[0]?.count ?? 0),
      overdueCount: Number(billRows[0]?.overdueCount ?? 0),
    },
    month: {
      label: formatMonthYear(today),
      start: monthStart,
      end: monthEnd,
      incomePence,
      costsPence,
      profitPence: subPence(incomePence, costsPence),
    },
    vat: {
      registered: vat.registered,
      label: vat.label,
      netVatDuePence: vat.boxes.netVatDue,
      dueDate: vat.dueDate,
      isEstimate: vat.isEstimate,
    },
    askMe: { openCount: Number(askRows[0]?.count ?? 0), topQuestion: askRows[0]?.top ?? null },
    receipts: {
      missingCount: missingReceiptRows[0]?.value ?? 0,
      unmatchedCount: unmatchedReceiptRows[0]?.value ?? 0,
    },
    deadlines,
  };
}

async function buildDeadlines(
  db: Database,
  companyId: string,
  today: IsoDate,
  vat: VatPeriodSummary,
): Promise<DashboardDeadline[]> {
  const deadlines: DashboardDeadline[] = [];

  if (vat.registered) {
    deadlines.push({
      kind: 'vat',
      label: `VAT return ${vat.label}`,
      detail: 'Prepare and file with HMRC',
      dueDate: vat.dueDate,
    });
  }

  const cis = await currentCisPeriod(db, companyId, today);
  if (cis.isContractor || cis.totals.subcontractorCount > 0) {
    deadlines.push({
      kind: 'cis',
      label: `CIS return ${cis.label}`,
      detail: 'Prepare monthly subcontractor return',
      dueDate: cis.dueDate,
    });
  }

  const nextInvoice = await db
    .select({ number: invoices.number, dueDate: invoices.dueDate })
    .from(invoices)
    .where(and(eq(invoices.companyId, companyId), sql`${invoices.status} in ('sent','part_paid')`))
    .orderBy(invoices.dueDate)
    .limit(1);

  if (nextInvoice[0]) {
    deadlines.push({
      kind: 'invoice',
      label: `Invoice ${nextInvoice[0].number} due`,
      detail: 'Chase if it is not paid',
      dueDate: nextInvoice[0].dueDate,
    });
  }

  return deadlines.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
