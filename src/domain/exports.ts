import { and, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  bankAccounts,
  billLines,
  bills,
  categories,
  companies,
  customers,
  documents,
  invoiceLines,
  invoices,
  jobs,
  journalEntries,
  journalLines,
  suppliers,
  transactions,
} from '@/db/schema';
import { toCsv } from '@/lib/csv';
import { penceToDecimalString } from '@/lib/money';
import type { IsoDate } from '@/lib/dates';
import type { ExportBundle } from '@/adapters/accounting';
import { SYSTEM_ACCOUNTS } from './ledger';

export type ExportFile = { filename: string; content: string; contentType: string };

function accountNameMap(): Map<string, string> {
  return new Map<string, string>(SYSTEM_ACCOUNTS.map((a) => [a.code as string, a.name as string]));
}

/** Transactions, ready for a bookkeeper or a spreadsheet. */
export async function exportTransactionsCsv(
  db: Database,
  companyId: string,
  range?: { start: IsoDate; end: IsoDate },
): Promise<ExportFile> {
  const conditions = [eq(transactions.companyId, companyId)];
  if (range) {
    conditions.push(gte(transactions.transactionDate, range.start));
    conditions.push(lte(transactions.transactionDate, range.end));
  }

  const rows = await db
    .select({
      t: transactions,
      accountName: bankAccounts.name,
      categoryName: categories.name,
      supplierName: suppliers.name,
      jobReference: jobs.reference,
      hasReceipt: sql<boolean>`exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, transactions.supplierId))
    .leftJoin(jobs, eq(jobs.id, transactions.jobId))
    .where(and(...conditions))
    .orderBy(transactions.transactionDate, transactions.createdAt);

  const content = toCsv(
    [
      'Date',
      'Account',
      'Description',
      'Money in',
      'Money out',
      'Net',
      'VAT',
      'VAT treatment',
      'Category',
      'Supplier',
      'Job',
      'Personal',
      'Status',
      'Reconciliation',
      'Has receipt',
      'How it was categorised',
      'Confidence',
      'Reason',
      'TradeBooks ID',
    ],
    rows.map((row) => [
      row.t.transactionDate,
      row.accountName,
      row.t.description,
      row.t.direction === 'money_in' ? penceToDecimalString(row.t.amountPence) : '',
      row.t.direction === 'money_out' ? penceToDecimalString(row.t.amountPence) : '',
      row.t.netPence === null ? '' : penceToDecimalString(row.t.netPence),
      row.t.vatPence === null ? '' : penceToDecimalString(row.t.vatPence),
      row.t.vatTreatment,
      row.categoryName ?? '',
      row.supplierName ?? '',
      row.jobReference ?? '',
      row.t.isPersonal ? 'Yes' : 'No',
      row.t.status,
      row.t.reconciliationStatus,
      row.hasReceipt ? 'Yes' : 'No',
      row.t.categorySource,
      row.t.categoryConfidence ?? '',
      row.t.categoryReason ?? '',
      row.t.id,
    ]),
  );

  return { filename: 'transactions.csv', content, contentType: 'text/csv' };
}

export async function exportInvoicesCsv(db: Database, companyId: string): Promise<ExportFile> {
  const rows = await db
    .select({ i: invoices, customerName: customers.name, jobReference: jobs.reference })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(jobs, eq(jobs.id, invoices.jobId))
    .where(eq(invoices.companyId, companyId))
    .orderBy(invoices.issueDate);

  const content = toCsv(
    [
      'Invoice number',
      'Customer',
      'Job',
      'Issue date',
      'Due date',
      'Status',
      'Net',
      'VAT',
      'Gross',
      'CIS deducted',
      'Paid',
      'Outstanding',
      'Reference',
      'TradeBooks ID',
    ],
    rows.map((row) => [
      row.i.number,
      row.customerName,
      row.jobReference ?? '',
      row.i.issueDate,
      row.i.dueDate,
      row.i.status,
      penceToDecimalString(row.i.netPence),
      penceToDecimalString(row.i.vatPence),
      penceToDecimalString(row.i.grossPence),
      penceToDecimalString(row.i.cisDeductionPence),
      penceToDecimalString(row.i.paidPence),
      penceToDecimalString(row.i.grossPence - row.i.cisDeductionPence - row.i.paidPence),
      row.i.reference ?? '',
      row.i.id,
    ]),
  );

  return { filename: 'invoices.csv', content, contentType: 'text/csv' };
}

export async function exportBillsCsv(db: Database, companyId: string): Promise<ExportFile> {
  const rows = await db
    .select({ b: bills, supplierName: suppliers.name, jobReference: jobs.reference })
    .from(bills)
    .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
    .leftJoin(jobs, eq(jobs.id, bills.jobId))
    .where(eq(bills.companyId, companyId))
    .orderBy(bills.billDate);

  const content = toCsv(
    [
      'Bill number',
      'Supplier reference',
      'Supplier',
      'Job',
      'Bill date',
      'Due date',
      'Status',
      'Net',
      'VAT',
      'Gross',
      'Subcontractor',
      'CIS labour',
      'CIS materials',
      'CIS deduction',
      'Paid',
      'Outstanding',
      'TradeBooks ID',
    ],
    rows.map((row) => [
      row.b.number,
      row.b.reference ?? '',
      row.supplierName,
      row.jobReference ?? '',
      row.b.billDate,
      row.b.dueDate,
      row.b.status,
      penceToDecimalString(row.b.netPence),
      penceToDecimalString(row.b.vatPence),
      penceToDecimalString(row.b.grossPence),
      row.b.isSubcontractorPayment ? 'Yes' : 'No',
      penceToDecimalString(row.b.cisLabourPence),
      penceToDecimalString(row.b.cisMaterialsPence),
      penceToDecimalString(row.b.cisDeductionPence),
      penceToDecimalString(row.b.paidPence),
      penceToDecimalString(row.b.grossPence - row.b.cisDeductionPence - row.b.paidPence),
      row.b.id,
    ]),
  );

  return { filename: 'bills.csv', content, contentType: 'text/csv' };
}

export async function exportCustomersCsv(db: Database, companyId: string): Promise<ExportFile> {
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.companyId, companyId))
    .orderBy(customers.name);

  return {
    filename: 'customers.csv',
    contentType: 'text/csv',
    content: toCsv(
      ['Name', 'Contact', 'Email', 'Phone', 'Address', 'Town', 'Postcode', 'Payment terms (days)', 'TradeBooks ID'],
      rows.map((row) => [
        row.name,
        row.contactName ?? '',
        row.email ?? '',
        row.phone ?? '',
        [row.addressLine1, row.addressLine2].filter(Boolean).join(', '),
        row.city ?? '',
        row.postcode ?? '',
        row.paymentTermsDays,
        row.id,
      ]),
    ),
  };
}

export async function exportSuppliersCsv(db: Database, companyId: string): Promise<ExportFile> {
  const rows = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.companyId, companyId))
    .orderBy(suppliers.name);

  return {
    filename: 'suppliers.csv',
    contentType: 'text/csv',
    content: toCsv(
      [
        'Name',
        'Type',
        'Email',
        'Phone',
        'VAT number',
        'Subcontractor',
        'UTR',
        'CIS status',
        'CIS verification number',
        'TradeBooks ID',
      ],
      rows.map((row) => [
        row.name,
        row.kind,
        row.email ?? '',
        row.phone ?? '',
        row.vatNumber ?? '',
        row.isSubcontractor ? 'Yes' : 'No',
        row.utr ?? '',
        row.cisStatus,
        row.cisVerificationNumber ?? '',
        row.id,
      ]),
    ),
  };
}

export async function exportJobsCsv(db: Database, companyId: string): Promise<ExportFile> {
  const { listJobSummaries } = await import('./jobs');
  const summaries = await listJobSummaries(db, companyId);
  return {
    filename: 'jobs.csv',
    contentType: 'text/csv',
    content: toCsv(
      ['Reference', 'Job', 'Customer', 'Status', 'Invoiced (net)', 'Costs', 'Profit', 'Margin %', 'TradeBooks ID'],
      summaries.map((job) => [
        job.reference,
        job.name,
        job.customerName ?? '',
        job.status,
        penceToDecimalString(job.invoicedNetPence),
        penceToDecimalString(job.costsPence),
        penceToDecimalString(job.profitPence),
        job.marginBasisPoints === null ? '' : (job.marginBasisPoints / 100).toFixed(1),
        job.id,
      ]),
    ),
  };
}

/** The internal journal, so a bookkeeper can check every posting. */
export async function exportJournalCsv(
  db: Database,
  companyId: string,
  range?: { start: IsoDate; end: IsoDate },
): Promise<ExportFile> {
  const conditions = [eq(journalEntries.companyId, companyId)];
  if (range) {
    conditions.push(gte(journalEntries.entryDate, range.start));
    conditions.push(lte(journalEntries.entryDate, range.end));
  }

  const rows = await db
    .select({ entry: journalEntries, line: journalLines })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conditions))
    .orderBy(journalEntries.entryDate, journalEntries.createdAt);

  const accountNames = accountNameMap();

  return {
    filename: 'journal.csv',
    contentType: 'text/csv',
    content: toCsv(
      ['Date', 'Narrative', 'Source', 'Account code', 'Account', 'Debit', 'Credit', 'Memo'],
      rows.map(({ entry, line }) => [
        entry.entryDate,
        entry.narrative,
        entry.sourceType,
        line.accountCode,
        accountNames.get(line.accountCode) ?? '',
        line.amountPence > 0 ? penceToDecimalString(line.amountPence) : '',
        line.amountPence < 0 ? penceToDecimalString(-line.amountPence) : '',
        line.memo ?? '',
      ]),
    ),
  };
}

export type TrialBalanceRow = {
  code: string;
  name: string;
  debitPence: number;
  creditPence: number;
};

/**
 * Trial balance from the internal journal. Debits must equal credits; the
 * accountant workspace shows the difference so a problem is visible at once.
 */
export async function trialBalance(
  db: Database,
  companyId: string,
  range?: { start: IsoDate; end: IsoDate },
): Promise<{ rows: TrialBalanceRow[]; totalDebitPence: number; totalCreditPence: number; balanced: boolean }> {
  const conditions = [eq(journalLines.companyId, companyId)];
  if (range) {
    conditions.push(gte(journalEntries.entryDate, range.start));
    conditions.push(lte(journalEntries.entryDate, range.end));
  }

  const rows = await db
    .select({
      code: journalLines.accountCode,
      total: sql<number>`coalesce(sum(${journalLines.amountPence}), 0)::bigint`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .where(and(...conditions))
    .groupBy(journalLines.accountCode);

  const accountNames = accountNameMap();
  const mapped = rows
    .map((row) => {
      const total = Number(row.total);
      return {
        code: row.code,
        name: accountNames.get(row.code) ?? row.code,
        debitPence: total > 0 ? total : 0,
        creditPence: total < 0 ? -total : 0,
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  const totalDebitPence = mapped.reduce((sum, r) => sum + r.debitPence, 0);
  const totalCreditPence = mapped.reduce((sum, r) => sum + r.creditPence, 0);

  return {
    rows: mapped,
    totalDebitPence,
    totalCreditPence,
    balanced: totalDebitPence === totalCreditPence,
  };
}

/**
 * The canonical bundle handed to an accounting connector or written out as
 * an accountant-ready pack. Provider-specific mapping happens in adapters.
 */
export async function buildExportBundle(
  db: Database,
  companyId: string,
  range?: { start: IsoDate; end: IsoDate },
): Promise<ExportBundle> {
  const companyRows = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const company = companyRows[0];
  if (!company) throw new Error('Company not found');

  const customerRows = await db.select().from(customers).where(eq(customers.companyId, companyId));
  const supplierRows = await db.select().from(suppliers).where(eq(suppliers.companyId, companyId));

  const invoiceConditions = [eq(invoices.companyId, companyId), sql`${invoices.status} <> 'draft'`];
  if (range) {
    invoiceConditions.push(gte(invoices.issueDate, range.start));
    invoiceConditions.push(lte(invoices.issueDate, range.end));
  }
  const invoiceRows = await db
    .select({ i: invoices, customerName: customers.name })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .where(and(...invoiceConditions));

  const invoiceLineRows = await db
    .select({ line: invoiceLines, categoryName: categories.name, categoryCode: categories.code, ledgerAccountCode: categories.ledgerAccountCode, jobReference: jobs.reference })
    .from(invoiceLines)
    .leftJoin(categories, eq(categories.id, invoiceLines.categoryId))
    .leftJoin(jobs, eq(jobs.id, invoiceLines.jobId))
    .where(eq(invoiceLines.companyId, companyId));

  const billConditions = [eq(bills.companyId, companyId), sql`${bills.status} <> 'void'`];
  if (range) {
    billConditions.push(gte(bills.billDate, range.start));
    billConditions.push(lte(bills.billDate, range.end));
  }
  const billRows = await db
    .select({ b: bills, supplierName: suppliers.name })
    .from(bills)
    .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
    .where(and(...billConditions));

  const billLineRows = await db
    .select({ line: billLines, categoryName: categories.name, categoryCode: categories.code, ledgerAccountCode: categories.ledgerAccountCode, jobReference: jobs.reference })
    .from(billLines)
    .leftJoin(categories, eq(categories.id, billLines.categoryId))
    .leftJoin(jobs, eq(jobs.id, billLines.jobId))
    .where(eq(billLines.companyId, companyId));

  const transactionConditions = [eq(transactions.companyId, companyId)];
  if (range) {
    transactionConditions.push(gte(transactions.transactionDate, range.start));
    transactionConditions.push(lte(transactions.transactionDate, range.end));
  }
  const transactionRows = await db
    .select({
      t: transactions,
      accountName: bankAccounts.name,
      categoryName: categories.name,
      categoryCode: categories.code,
      ledgerAccountCode: categories.ledgerAccountCode,
      jobReference: jobs.reference,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(jobs, eq(jobs.id, transactions.jobId))
    .where(and(...transactionConditions));

  const linesByInvoice = groupBy(invoiceLineRows, (r) => r.line.invoiceId);
  const linesByBill = groupBy(billLineRows, (r) => r.line.billId);

  return {
    companyName: company.name,
    generatedAt: new Date().toISOString(),
    periodStart: range?.start,
    periodEnd: range?.end,
    contacts: [
      ...customerRows.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email,
        phone: c.phone,
        addressLine1: c.addressLine1,
        city: c.city,
        postcode: c.postcode,
        kind: 'customer' as const,
      })),
      ...supplierRows.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        phone: s.phone,
        addressLine1: s.addressLine1,
        city: s.city,
        postcode: s.postcode,
        kind: 'supplier' as const,
      })),
    ],
    invoices: invoiceRows.map(({ i, customerName }) => ({
      id: i.id,
      number: i.number,
      contactName: customerName,
      contactId: i.customerId,
      issueDate: i.issueDate,
      dueDate: i.dueDate,
      reference: i.reference,
      status: i.status,
      netPence: i.netPence,
      vatPence: i.vatPence,
      grossPence: i.grossPence,
      paidPence: i.paidPence,
      lines: (linesByInvoice.get(i.id) ?? []).map((row) => ({
        description: row.line.description,
        quantityMilli: row.line.quantityMilli,
        unitPricePence: row.line.unitPricePence,
        netPence: row.line.netPence,
        vatPence: row.line.vatPence,
        grossPence: row.line.grossPence,
        vatTreatment: row.line.vatTreatment,
        vatRateBasisPoints: row.line.vatRateBasisPoints,
        categoryName: row.categoryName,
        categoryCode: row.categoryCode,
        ledgerAccountCode: row.ledgerAccountCode,
        jobReference: row.jobReference,
      })),
    })),
    bills: billRows.map(({ b, supplierName }) => ({
      id: b.id,
      supplierId: b.supplierId,
      number: b.number,
      contactName: supplierName,
      contactId: b.supplierId,
      issueDate: b.billDate,
      dueDate: b.dueDate,
      reference: b.reference,
      status: b.status,
      netPence: b.netPence,
      vatPence: b.vatPence,
      grossPence: b.grossPence,
      paidPence: b.paidPence,
      lines: (linesByBill.get(b.id) ?? []).map((row) => ({
        description: row.line.description,
        quantityMilli: row.line.quantityMilli,
        unitPricePence: row.line.unitPricePence,
        netPence: row.line.netPence,
        vatPence: row.line.vatPence,
        grossPence: row.line.grossPence,
        vatTreatment: row.line.vatTreatment,
        vatRateBasisPoints: row.line.vatRateBasisPoints,
        categoryName: row.categoryName,
        categoryCode: row.categoryCode,
        ledgerAccountCode: row.ledgerAccountCode,
        jobReference: row.jobReference,
      })),
    })),
    transactions: transactionRows.map((row) => ({
      id: row.t.id,
      date: row.t.transactionDate,
      amountPence: row.t.amountPence,
      direction: row.t.direction,
      description: row.t.description,
      categoryName: row.categoryName,
      categoryCode: row.categoryCode,
      ledgerAccountCode: row.ledgerAccountCode,
      vatTreatment: row.t.vatTreatment,
      netPence: row.t.netPence,
      vatPence: row.t.vatPence,
      bankAccountName: row.accountName,
      jobReference: row.jobReference,
    })),
  };
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Everything an accountant needs, as a set of CSV files. */
export async function buildAccountantPack(
  db: Database,
  companyId: string,
  range?: { start: IsoDate; end: IsoDate },
): Promise<ExportFile[]> {
  return Promise.all([
    exportTransactionsCsv(db, companyId, range),
    exportInvoicesCsv(db, companyId),
    exportBillsCsv(db, companyId),
    exportCustomersCsv(db, companyId),
    exportSuppliersCsv(db, companyId),
    exportJobsCsv(db, companyId),
    exportJournalCsv(db, companyId, range),
  ]);
}
