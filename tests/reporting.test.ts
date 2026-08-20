import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { categoryIdByCode, resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { customers, jobs, suppliers } from '@/db/schema';
import { createInvoice, recordPayment, sendInvoice } from '@/domain/invoices';
import { createBill } from '@/domain/bills';
import { applyCategorisation, createTransaction, linkTransaction } from '@/domain/transactions';
import { calculateJobProfitability, listJobSummaries, unallocatedJobCosts } from '@/domain/jobs';
import { calculateVatPeriod, prepareVatPeriod } from '@/domain/vat-return';
import { calculateCisPeriod, prepareCisPeriod } from '@/domain/cis';
import { buildDashboard } from '@/domain/dashboard';
import { parseStatementCsv, parseFlexibleDate, importStatement } from '@/domain/import';
import { buildExportBundle, exportTransactionsCsv, trialBalance } from '@/domain/exports';
import { XeroAdapter, QuickBooksAdapter, FreeAgentAdapter, AccountingNotConnectedError } from '@/adapters/accounting';
import { parseCsv } from '@/lib/csv';

let db: Database;
let fixture: Fixture;
let customerId: string;
let jobId: string;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
  const [customer] = await db
    .insert(customers)
    .values({ companyId: fixture.companyId, name: 'Halewood Property' })
    .returning({ id: customers.id });
  customerId = customer!.id;
  const [job] = await db
    .insert(jobs)
    .values({
      companyId: fixture.companyId,
      reference: 'J-1001',
      name: 'Re-roof',
      customerId,
      quotedRevenuePence: 1_000_000,
    })
    .returning({ id: jobs.id });
  jobId = job!.id;
});

describe('job profitability', () => {
  it('is revenue excluding VAT less costs excluding VAT', async () => {
    const salesId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const labourId = await categoryIdByCode(db, fixture.companyId, 'subcontractors');

    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      jobId,
      issueDate: '2026-05-01',
      lines: [
        {
          description: 'Re-roof',
          quantityMilli: 1000,
          unitPricePence: 1_000_000,
          vatTreatment: 'standard',
          categoryId: salesId,
          jobId,
        },
      ],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);

    const [supplier] = await db
      .insert(suppliers)
      .values({ companyId: fixture.companyId, name: 'SIG Roofing' })
      .returning({ id: suppliers.id });

    await createBill(db, {
      companyId: fixture.companyId,
      supplierId: supplier!.id,
      billDate: '2026-05-02',
      jobId,
      lines: [
        {
          description: 'Tiles',
          quantityMilli: 1000,
          unitPricePence: 300_000,
          vatTreatment: 'standard',
          categoryId: materialsId,
          jobId,
        },
      ],
      userId: fixture.ownerId,
    });

    const cash = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-03',
      direction: 'money_out',
      amountPence: 120_000,
      description: 'FASTER PAYMENT LABOUR',
    });
    await applyCategorisation(db, fixture.companyId, cash.id, {
      categoryId: labourId,
      jobId,
      source: 'user',
    });

    const profit = await calculateJobProfitability(db, fixture.companyId, jobId);
    expect(profit.invoicedNetPence).toBe(1_000_000);
    expect(profit.costs.materialsPence).toBe(300_000);
    // Labour is reverse-charge by default so the full amount is the net cost.
    expect(profit.costs.labourPence).toBe(120_000);
    expect(profit.costs.totalPence).toBe(420_000);
    expect(profit.grossProfitPence).toBe(580_000);
    expect(profit.marginBasisPoints).toBe(5800);
  });

  it('does not count a cost twice when a payment settles a bill', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const [supplier] = await db
      .insert(suppliers)
      .values({ companyId: fixture.companyId, name: 'SIG Roofing' })
      .returning({ id: suppliers.id });

    const bill = await createBill(db, {
      companyId: fixture.companyId,
      supplierId: supplier!.id,
      billDate: '2026-05-02',
      jobId,
      lines: [
        {
          description: 'Tiles',
          quantityMilli: 1000,
          unitPricePence: 300_000,
          vatTreatment: 'standard',
          categoryId: materialsId,
          jobId,
        },
      ],
      userId: fixture.ownerId,
    });

    const payment = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-20',
      direction: 'money_out',
      amountPence: 360_000,
      description: 'FASTER PAYMENT SIG ROOFING',
    });
    await applyCategorisation(db, fixture.companyId, payment.id, {
      categoryId: materialsId,
      jobId,
      source: 'user',
    });
    await linkTransaction(db, fixture.companyId, {
      transactionId: payment.id,
      linkedType: 'bill',
      linkedId: bill.id,
      amountPence: 360_000,
    });

    const profit = await calculateJobProfitability(db, fixture.companyId, jobId);
    expect(profit.costs.totalPence).toBe(300_000);
  });

  it('keeps unallocated job costs visible', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const orphan = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-03',
      direction: 'money_out',
      amountPence: 60_000,
      description: 'CARD PURCHASE TRAVIS PERKINS',
    });
    await applyCategorisation(db, fixture.companyId, orphan.id, { categoryId: materialsId, source: 'user' });

    const unallocated = await unallocatedJobCosts(db, fixture.companyId);
    expect(unallocated.count).toBe(1);
    expect(unallocated.totalPence).toBe(50_000);

    const summaries = await listJobSummaries(db, fixture.companyId);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.costsPence).toBe(0);
  });
});

describe('VAT period', () => {
  it('derives the boxes from recorded invoices, bills and transactions', async () => {
    const salesId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');

    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-10',
      lines: [
        {
          description: 'Roofing',
          quantityMilli: 1000,
          unitPricePence: 1_000_000,
          vatTreatment: 'standard',
          categoryId: salesId,
        },
      ],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);

    const purchase = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-12',
      direction: 'money_out',
      amountPence: 120_000,
      description: 'CARD PURCHASE TRAVIS PERKINS',
    });
    await applyCategorisation(db, fixture.companyId, purchase.id, {
      categoryId: materialsId,
      source: 'user',
    });

    const summary = await calculateVatPeriod(db, fixture.companyId, '2026-04-01', '2026-06-30');
    expect(summary.boxes.vatDueSales).toBe(200_000);
    expect(summary.boxes.vatReclaimed).toBe(20_000);
    expect(summary.boxes.netVatDue).toBe(180_000);
    expect(summary.boxes.totalSalesExVat).toBe(1_000_000);
    expect(summary.boxes.totalPurchasesExVat).toBe(100_000);
    expect(summary.isEstimate).toBe(true);
    expect(summary.status).toBe('open');
  });

  it('accounts for reverse charge on both sides so the net effect is nil', async () => {
    const labourId = await categoryIdByCode(db, fixture.companyId, 'subcontractors');
    const [supplier] = await db
      .insert(suppliers)
      .values({
        companyId: fixture.companyId,
        name: 'M Doyle',
        isSubcontractor: true,
        cisStatus: 'net_20',
      })
      .returning({ id: suppliers.id });

    await createBill(db, {
      companyId: fixture.companyId,
      supplierId: supplier!.id,
      billDate: '2026-05-05',
      lines: [
        {
          description: 'Labour',
          quantityMilli: 1000,
          unitPricePence: 500_000,
          vatTreatment: 'reverse_charge',
          categoryId: labourId,
          isLabour: true,
        },
      ],
      userId: fixture.ownerId,
    });

    const summary = await calculateVatPeriod(db, fixture.companyId, '2026-04-01', '2026-06-30');
    expect(summary.boxes.vatDueSales).toBe(100_000);
    expect(summary.boxes.vatReclaimed).toBe(100_000);
    expect(summary.boxes.netVatDue).toBe(0);
  });

  it('warns when evidence is missing and only stops being an estimate once filed', async () => {
    const unsorted = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-12',
      direction: 'money_out',
      amountPence: 50_000,
      description: 'FASTER PAYMENT SMITH SERVICES',
    });
    expect(unsorted.created).toBe(true);

    let summary = await calculateVatPeriod(db, fixture.companyId, '2026-04-01', '2026-06-30');
    expect(summary.warnings.some((w) => w.message.includes('no category'))).toBe(true);
    expect(summary.readiness.find((r) => r.label.includes('category'))?.done).toBe(false);

    await prepareVatPeriod(db, fixture.companyId, '2026-04-01', '2026-06-30', fixture.ownerId);
    summary = await calculateVatPeriod(db, fixture.companyId, '2026-04-01', '2026-06-30');
    expect(summary.status).toBe('prepared');
    expect(summary.isEstimate).toBe(true);
  });
});

describe('CIS period', () => {
  it('totals labour, materials and deductions per subcontractor', async () => {
    const labourId = await categoryIdByCode(db, fixture.companyId, 'subcontractors');
    const [verified] = await db
      .insert(suppliers)
      .values({
        companyId: fixture.companyId,
        name: 'M Doyle Roofing',
        isSubcontractor: true,
        cisStatus: 'net_20',
        utr: '4536271890',
        cisVerificationNumber: 'V123',
      })
      .returning({ id: suppliers.id });
    const [unverified] = await db
      .insert(suppliers)
      .values({ companyId: fixture.companyId, name: 'J Patel', isSubcontractor: true, cisStatus: 'unknown' })
      .returning({ id: suppliers.id });

    await createBill(db, {
      companyId: fixture.companyId,
      supplierId: verified!.id,
      billDate: '2026-05-10',
      lines: [
        { description: 'Labour', quantityMilli: 1000, unitPricePence: 400_000, vatTreatment: 'reverse_charge', categoryId: labourId, isLabour: true },
        { description: 'Materials', quantityMilli: 1000, unitPricePence: 100_000, vatTreatment: 'reverse_charge', isLabour: false },
      ],
      userId: fixture.ownerId,
    });
    await createBill(db, {
      companyId: fixture.companyId,
      supplierId: unverified!.id,
      billDate: '2026-05-12',
      lines: [
        { description: 'Labour', quantityMilli: 1000, unitPricePence: 100_000, vatTreatment: 'reverse_charge', categoryId: labourId, isLabour: true },
      ],
      userId: fixture.ownerId,
    });

    const period = await calculateCisPeriod(db, fixture.companyId, '2026-05-06', '2026-06-05');
    expect(period.totals.subcontractorCount).toBe(2);
    expect(period.totals.labourPence).toBe(500_000);
    expect(period.totals.materialsPence).toBe(100_000);
    // 20% of 400,000 plus 30% of 100,000.
    expect(period.totals.deductionPence).toBe(80_000 + 30_000);
    expect(period.warnings.some((w) => w.message.includes('unverified'))).toBe(true);
    expect(period.warnings.some((w) => w.message.includes('UTR'))).toBe(true);

    await prepareCisPeriod(db, fixture.companyId, '2026-05-06', '2026-06-05', fixture.ownerId);
    const prepared = await calculateCisPeriod(db, fixture.companyId, '2026-05-06', '2026-06-05');
    expect(prepared.status).toBe('prepared');
  });
});

describe('dashboard', () => {
  it('reports cash, money owed and bills due from the records', async () => {
    const salesId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      dueDate: '2026-05-31',
      lines: [
        { description: 'Roofing', quantityMilli: 1000, unitPricePence: 100_000, vatTreatment: 'standard', categoryId: salesId },
      ],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);

    await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-05',
      direction: 'money_in',
      amountPence: 50_000,
      description: 'BANK CREDIT',
    });

    const dashboard = await buildDashboard(db, fixture.companyId, '2026-05-15');
    expect(dashboard.cash.totalPence).toBe(150_000);
    expect(dashboard.owedToYou.totalPence).toBe(120_000);
    expect(dashboard.owedToYou.overdueCount).toBe(0);
    expect(dashboard.month.label).toBe('May 2026');
    expect(dashboard.deadlines.some((d) => d.kind === 'vat')).toBe(true);

    const later = await buildDashboard(db, fixture.companyId, '2026-06-15');
    expect(later.owedToYou.overduePence).toBe(120_000);
  });

  it('shows nothing rather than guessing for an empty business', async () => {
    const dashboard = await buildDashboard(db, fixture.otherCompanyId, '2026-05-15');
    expect(dashboard.cash.totalPence).toBe(0);
    expect(dashboard.owedToYou.totalPence).toBe(0);
    expect(dashboard.askMe.openCount).toBe(0);
    expect(dashboard.month.profitPence).toBe(0);
  });
});

describe('CSV import', () => {
  it('reads a debit/credit column statement', () => {
    const csv = [
      'Date,Description,Paid in,Paid out,Balance',
      '01/05/2026,CARD PURCHASE TRAVIS PERKINS,,148.62,1091.38',
      '02/05/2026,BANK CREDIT HALEWOOD,"1,500.00",,2591.38',
    ].join('\n');
    const { rows, errors } = parseStatementCsv(csv);
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-05-01', amountPence: 14_862, direction: 'money_out' });
    expect(rows[1]).toMatchObject({ date: '2026-05-02', amountPence: 150_000, direction: 'money_in' });
  });

  it('reads a single signed amount column', () => {
    const csv = ['Date,Description,Amount', '2026-05-01,SIG ROOFING,-386.40', '2026-05-02,PAYMENT IN,1200'].join('\n');
    const { rows } = parseStatementCsv(csv);
    expect(rows[0]).toMatchObject({ amountPence: 38_640, direction: 'money_out' });
    expect(rows[1]).toMatchObject({ amountPence: 120_000, direction: 'money_in' });
  });

  it('reports unreadable rows instead of failing the whole file', () => {
    const csv = [
      'Date,Description,Amount',
      '2026-05-01,GOOD ROW,-10.00',
      'not-a-date,BAD ROW,-10.00',
      '2026-05-03,,-10.00',
    ].join('\n');
    const { rows, errors } = parseStatementCsv(csv);
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(2);
    expect(errors[0]!.row).toBe(3);
  });

  it('handles quoted fields containing commas and newlines', () => {
    const parsed = parseCsv('a,b\n"one, two","line1\nline2"\n');
    expect(parsed.rows[0]).toEqual({ a: 'one, two', b: 'line1\nline2' });
  });

  it('reads UK day-first dates', () => {
    expect(parseFlexibleDate('05/06/2026')).toBe('2026-06-05');
    expect(parseFlexibleDate('2026-06-05')).toBe('2026-06-05');
    expect(parseFlexibleDate('5 Jun 2026')).toBe('2026-06-05');
    expect(parseFlexibleDate('rubbish')).toBeNull();
  });

  it('is idempotent — importing the same file twice adds nothing', async () => {
    const csv = [
      'Date,Description,Paid in,Paid out',
      '01/05/2026,CARD PURCHASE TRAVIS PERKINS,,148.62',
      '02/05/2026,CARD PURCHASE SIG ROOFING,,386.40',
    ].join('\n');

    const first = await importStatement(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      filename: 'statement.csv',
      content: csv,
      userId: fixture.ownerId,
      skipAutoProcess: true,
    });
    expect(first.imported).toBe(2);
    expect(first.alreadyImported).toBe(false);

    const second = await importStatement(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      filename: 'statement.csv',
      content: csv,
      userId: fixture.ownerId,
      skipAutoProcess: true,
    });
    expect(second.alreadyImported).toBe(true);
    expect(second.imported).toBe(2);
  });

  it('keeps genuinely repeated lines on the same day', async () => {
    const csv = [
      'Date,Description,Paid out',
      '01/05/2026,CARD PURCHASE SHELL,50.00',
      '01/05/2026,CARD PURCHASE SHELL,50.00',
    ].join('\n');
    const result = await importStatement(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      filename: 'shell.csv',
      content: csv,
      userId: fixture.ownerId,
      skipAutoProcess: true,
    });
    expect(result.imported).toBe(2);
    expect(result.duplicates).toBe(0);
  });
});

describe('exports and connectors', () => {
  it('exports transactions with their decision trail', async () => {
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const created = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-01',
      direction: 'money_out',
      amountPence: 148_620,
      description: 'CARD PURCHASE TRAVIS PERKINS',
    });
    await applyCategorisation(db, fixture.companyId, created.id, {
      categoryId: materialsId,
      source: 'rule',
      confidence: 100,
      reason: 'Matched your rule',
    });

    const file = await exportTransactionsCsv(db, fixture.companyId);
    const parsed = parseCsv(file.content);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]!['Money out']).toBe('1486.20');
    expect(parsed.rows[0]!['VAT']).toBe('247.70');
    expect(parsed.rows[0]!['How it was categorised']).toBe('rule');
    expect(parsed.rows[0]!['Reason']).toBe('Matched your rule');
  });

  it('maps the canonical bundle for each accounting package without connecting', async () => {
    const salesId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [
        { description: 'Roofing', quantityMilli: 1000, unitPricePence: 100_000, vatTreatment: 'standard', categoryId: salesId },
      ],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);

    const bundle = await buildExportBundle(db, fixture.companyId);
    expect(bundle.invoices).toHaveLength(1);
    expect(bundle.contacts.some((c) => c.kind === 'customer')).toBe(true);

    for (const adapter of [new XeroAdapter(), new QuickBooksAdapter(), new FreeAgentAdapter()]) {
      const mapped = adapter.map(bundle);
      expect(mapped.provider).toBe(adapter.name);
      expect(mapped.resources.length).toBeGreaterThan(0);
      expect(adapter.configured).toBe(false);
      expect(adapter.authorisationUrl(fixture.companyId)).toBeNull();
      expect(mapped.warnings).toBeInstanceOf(Array);
      await expect(adapter.push()).rejects.toBeInstanceOf(AccountingNotConnectedError);
    }

    const xero = new XeroAdapter().map(bundle);
    const invoices = xero.resources.find((r) => r.resource === 'Invoices')!;
    expect(invoices.records[0]).toMatchObject({ Type: 'ACCREC', InvoiceNumber: invoice.number });
    expect((invoices.records[0] as { LineItems: { TaxType: string }[] }).LineItems[0]!.TaxType).toBe('OUTPUT2');
  });

  it('keeps the trial balance balanced across every posting', async () => {
    const salesId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
    const materialsId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [
        { description: 'Roofing', quantityMilli: 1000, unitPricePence: 100_000, vatTreatment: 'standard', categoryId: salesId },
      ],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'customer_receipt',
      customerId,
      paymentDate: '2026-05-10',
      amountPence: 120_000,
      allocations: [{ invoiceId: invoice.id, amountPence: 120_000 }],
      userId: fixture.ownerId,
    });

    const purchase = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-11',
      direction: 'money_out',
      amountPence: 60_000,
      description: 'CARD PURCHASE TRAVIS PERKINS',
    });
    await applyCategorisation(db, fixture.companyId, purchase.id, { categoryId: materialsId, source: 'user' });

    const balance = await trialBalance(db, fixture.companyId);
    expect(balance.balanced).toBe(true);
    expect(balance.rows.some((r) => r.code === '1200')).toBe(true);
  });
});
