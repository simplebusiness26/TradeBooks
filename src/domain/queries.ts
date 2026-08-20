import { and, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '@/db/client';
import {
  bankAccounts,
  bills,
  categories,
  customers,
  documents,
  invoices,
  jobs,
  suppliers,
  transactions,
} from '@/db/schema';
import { todayIso, type IsoDate } from '@/lib/dates';

/** Read models shared by the list screens. */

export async function listInvoices(
  db: Database,
  companyId: string,
  options: { status?: 'all' | 'unpaid' | 'overdue' | 'paid' | 'draft'; search?: string; limit?: number } = {},
) {
  const today = todayIso();
  const conditions: SQL[] = [eq(invoices.companyId, companyId)];

  switch (options.status) {
    case 'unpaid':
      conditions.push(sql`${invoices.status} in ('sent','part_paid','overdue')`);
      break;
    case 'overdue':
      conditions.push(sql`${invoices.status} in ('sent','part_paid','overdue') and ${invoices.dueDate} < ${today}`);
      break;
    case 'paid':
      conditions.push(eq(invoices.status, 'paid'));
      break;
    case 'draft':
      conditions.push(eq(invoices.status, 'draft'));
      break;
    default:
      break;
  }

  if (options.search) {
    const term = `%${options.search}%`;
    conditions.push(or(ilike(invoices.number, term), ilike(customers.name, term))!);
  }

  const rows = await db
    .select({ invoice: invoices, customerName: customers.name, jobReference: jobs.reference })
    .from(invoices)
    .innerJoin(customers, eq(customers.id, invoices.customerId))
    .leftJoin(jobs, eq(jobs.id, invoices.jobId))
    .where(and(...conditions))
    .orderBy(desc(invoices.issueDate), desc(invoices.createdAt))
    .limit(options.limit ?? 100);

  return rows.map((row) => ({
    ...row.invoice,
    customerName: row.customerName,
    jobReference: row.jobReference,
    outstandingPence:
      row.invoice.status === 'void' || row.invoice.status === 'draft'
        ? 0
        : Math.max(0, row.invoice.grossPence - row.invoice.cisDeductionPence - row.invoice.paidPence),
    isOverdue:
      ['sent', 'part_paid', 'overdue'].includes(row.invoice.status) && row.invoice.dueDate < today,
  }));
}

export async function invoiceCounts(db: Database, companyId: string) {
  const today = todayIso();
  const rows = await db
    .select({
      all: sql<number>`count(*)::int`,
      unpaid: sql<number>`count(*) filter (where ${invoices.status} in ('sent','part_paid','overdue'))::int`,
      overdue: sql<number>`count(*) filter (where ${invoices.status} in ('sent','part_paid','overdue') and ${invoices.dueDate} < ${today})::int`,
      paid: sql<number>`count(*) filter (where ${invoices.status} = 'paid')::int`,
      draft: sql<number>`count(*) filter (where ${invoices.status} = 'draft')::int`,
    })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));
  return rows[0] ?? { all: 0, unpaid: 0, overdue: 0, paid: 0, draft: 0 };
}

export type TransactionFilter =
  | 'all'
  | 'needs_answer'
  | 'needs_receipt'
  | 'reviewed'
  | 'money_in'
  | 'money_out';

export async function listTransactions(
  db: Database,
  companyId: string,
  options: {
    filter?: TransactionFilter;
    search?: string;
    jobId?: string;
    categoryId?: string;
    from?: IsoDate;
    to?: IsoDate;
    limit?: number;
    offset?: number;
  } = {},
) {
  const conditions: SQL[] = [eq(transactions.companyId, companyId)];

  switch (options.filter) {
    case 'needs_answer':
      conditions.push(eq(transactions.status, 'needs_answer'));
      break;
    case 'needs_receipt':
      conditions.push(eq(transactions.needsReceipt, true));
      break;
    case 'reviewed':
      conditions.push(eq(transactions.status, 'reviewed'));
      break;
    case 'money_in':
      conditions.push(eq(transactions.direction, 'money_in'));
      break;
    case 'money_out':
      conditions.push(eq(transactions.direction, 'money_out'));
      break;
    default:
      break;
  }

  if (options.search) {
    conditions.push(ilike(transactions.description, `%${options.search}%`));
  }
  if (options.jobId) conditions.push(eq(transactions.jobId, options.jobId));
  if (options.categoryId) conditions.push(eq(transactions.categoryId, options.categoryId));
  if (options.from) conditions.push(sql`${transactions.transactionDate} >= ${options.from}`);
  if (options.to) conditions.push(sql`${transactions.transactionDate} <= ${options.to}`);

  const rows = await db
    .select({
      transaction: transactions,
      accountName: bankAccounts.name,
      categoryName: categories.name,
      supplierName: suppliers.name,
      customerName: customers.name,
      jobReference: jobs.reference,
      hasReceipt: sql<boolean>`exists (select 1 from ${documents} d where d.matched_transaction_id = ${transactions.id})`,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(bankAccounts.id, transactions.bankAccountId))
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(suppliers, eq(suppliers.id, transactions.supplierId))
    .leftJoin(customers, eq(customers.id, transactions.customerId))
    .leftJoin(jobs, eq(jobs.id, transactions.jobId))
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt))
    .limit(options.limit ?? 60)
    .offset(options.offset ?? 0);

  return rows.map((row) => ({ ...row.transaction, ...row, transaction: undefined }));
}

export async function transactionCounts(db: Database, companyId: string) {
  const rows = await db
    .select({
      all: sql<number>`count(*)::int`,
      needsAnswer: sql<number>`count(*) filter (where ${transactions.status} = 'needs_answer')::int`,
      needsReceipt: sql<number>`count(*) filter (where ${transactions.needsReceipt})::int`,
      reviewed: sql<number>`count(*) filter (where ${transactions.status} = 'reviewed')::int`,
    })
    .from(transactions)
    .where(eq(transactions.companyId, companyId));
  return rows[0] ?? { all: 0, needsAnswer: 0, needsReceipt: 0, reviewed: 0 };
}

export async function listDocuments(
  db: Database,
  companyId: string,
  options: { status?: 'all' | 'unmatched' | 'needs_answer' | 'matched'; limit?: number } = {},
) {
  const conditions: SQL[] = [eq(documents.companyId, companyId)];
  switch (options.status) {
    case 'unmatched':
      conditions.push(sql`${documents.matchedTransactionId} is null`);
      break;
    case 'needs_answer':
      conditions.push(eq(documents.status, 'needs_answer'));
      break;
    case 'matched':
      conditions.push(sql`${documents.matchedTransactionId} is not null`);
      break;
    default:
      break;
  }

  const rows = await db
    .select({
      document: documents,
      supplierName: suppliers.name,
      jobReference: jobs.reference,
      transactionDescription: transactions.description,
      transactionAmountPence: transactions.amountPence,
      transactionDate: transactions.transactionDate,
    })
    .from(documents)
    .leftJoin(suppliers, eq(suppliers.id, documents.supplierId))
    .leftJoin(jobs, eq(jobs.id, documents.jobId))
    .leftJoin(transactions, eq(transactions.id, documents.matchedTransactionId))
    .where(and(...conditions))
    .orderBy(desc(documents.createdAt))
    .limit(options.limit ?? 60);

  return rows.map((row) => ({ ...row.document, ...row, document: undefined }));
}

export async function documentCounts(db: Database, companyId: string) {
  const rows = await db
    .select({
      all: sql<number>`count(*)::int`,
      unmatched: sql<number>`count(*) filter (where ${documents.matchedTransactionId} is null)::int`,
      needsAnswer: sql<number>`count(*) filter (where ${documents.status} = 'needs_answer')::int`,
    })
    .from(documents)
    .where(eq(documents.companyId, companyId));
  return rows[0] ?? { all: 0, unmatched: 0, needsAnswer: 0 };
}

export async function activeCategories(db: Database, companyId: string) {
  return db
    .select()
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.isArchived, false)))
    .orderBy(categories.sortOrder, categories.name);
}

export async function activeJobs(db: Database, companyId: string) {
  return db
    .select({ id: jobs.id, reference: jobs.reference, name: jobs.name, status: jobs.status })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), eq(jobs.isArchived, false)))
    .orderBy(desc(jobs.createdAt));
}

export async function activeCustomers(db: Database, companyId: string) {
  return db
    .select()
    .from(customers)
    .where(and(eq(customers.companyId, companyId), eq(customers.isArchived, false)))
    .orderBy(customers.name);
}

export async function activeSuppliers(db: Database, companyId: string) {
  return db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.companyId, companyId), eq(suppliers.isArchived, false)))
    .orderBy(suppliers.name);
}

export async function activeBankAccounts(db: Database, companyId: string) {
  return db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.companyId, companyId), eq(bankAccounts.isArchived, false)))
    .orderBy(bankAccounts.name);
}

export async function listBills(
  db: Database,
  companyId: string,
  options: { status?: 'all' | 'unpaid' | 'paid'; limit?: number } = {},
) {
  const conditions: SQL[] = [eq(bills.companyId, companyId)];
  if (options.status === 'unpaid') conditions.push(sql`${bills.status} in ('awaiting_payment','part_paid')`);
  if (options.status === 'paid') conditions.push(eq(bills.status, 'paid'));

  const today = todayIso();
  const rows = await db
    .select({ bill: bills, supplierName: suppliers.name, jobReference: jobs.reference })
    .from(bills)
    .innerJoin(suppliers, eq(suppliers.id, bills.supplierId))
    .leftJoin(jobs, eq(jobs.id, bills.jobId))
    .where(and(...conditions))
    .orderBy(bills.dueDate)
    .limit(options.limit ?? 100);

  return rows.map((row) => ({
    ...row.bill,
    supplierName: row.supplierName,
    jobReference: row.jobReference,
    outstandingPence:
      row.bill.status === 'void'
        ? 0
        : Math.max(0, row.bill.grossPence - row.bill.cisDeductionPence - row.bill.paidPence),
    isOverdue: ['awaiting_payment', 'part_paid'].includes(row.bill.status) && row.bill.dueDate < today,
  }));
}
