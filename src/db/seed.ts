import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDatabase, type Database } from './client';
import { loadEnv } from '@/lib/env';
import {
  categories,
  companies,
  customers,
  jobs,
  suppliers,
  transactions,
} from './schema';
import { addBankAccount, addMember, createCompany, createUser } from '@/domain/company';
import { createInvoice, recordPayment, refreshInvoiceStatus, sendInvoice } from '@/domain/invoices';
import { createBill } from '@/domain/bills';
import { importStatement } from '@/domain/import';
import { autoProcessTransaction, linkTransaction } from '@/domain/transactions';
import { flagMissingReceipts, uploadReceipt } from '@/domain/documents';
import { addDays, todayIso, type IsoDate } from '@/lib/dates';
import { refreshBillStatus } from '@/domain/bills';
import {
  DEMO_COMPANY,
  DEMO_CUSTOMERS,
  DEMO_JOBS,
  DEMO_SUBCONTRACTORS,
  DEMO_SUPPLIERS,
  DEMO_USERS,
} from './demo/data';
import { buildStatementCsv, buildTextReceipt, type DemoStatementLine } from './demo/statement';

export type SeedResult = {
  companyId: string;
  users: { email: string; role: string }[];
  counts: Record<string, number>;
};

/**
 * Builds the demo roofing business. Idempotent: running it twice reuses the
 * existing demo company rather than duplicating it.
 */
export async function seedDemo(db: Database, options: { password: string; today?: IsoDate } = { password: 'DemoPassw0rd!' }): Promise<SeedResult> {
  const today = options.today ?? todayIso();

  const existing = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.name, DEMO_COMPANY.name))
    .limit(1);

  if (existing[0]) {
    return {
      companyId: existing[0].id,
      users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role })),
      counts: { skipped: 1 },
    };
  }

  const companyId = await createCompany(db, {
    name: DEMO_COMPANY.name,
    tradingName: DEMO_COMPANY.tradingName,
    trade: 'roofing',
    vatRegistered: true,
    vatNumber: DEMO_COMPANY.vatNumber,
    cisContractor: true,
    cisSubcontractor: true,
    isDemo: true,
  });

  await db
    .update(companies)
    .set({
      addressLine1: DEMO_COMPANY.addressLine1,
      city: DEMO_COMPANY.city,
      postcode: DEMO_COMPANY.postcode,
      phone: DEMO_COMPANY.phone,
      email: DEMO_COMPANY.email,
      cisUtr: DEMO_COMPANY.cisUtr,
    })
    .where(eq(companies.id, companyId));

  // --- People ---------------------------------------------------------------
  const userIds: Record<string, string> = {};
  for (const user of DEMO_USERS) {
    const id = await createUser(db, { email: user.email, name: user.name, password: options.password });
    await addMember(db, companyId, id, user.role, { isDefault: user.role === 'owner' });
    userIds[user.role] = id;
  }
  const ownerId = userIds.owner!;

  // --- Accounts -------------------------------------------------------------
  const currentAccountId = await addBankAccount(db, companyId, {
    name: 'Business current account',
    accountType: 'current',
    sortCode: '20-00-00',
    accountNumberLast4: '4471',
    openingBalancePence: 1_240_000,
    openingBalanceDate: addDays(today, -120),
  });
  await addBankAccount(db, companyId, {
    name: 'Business credit card',
    accountType: 'credit_card',
    accountNumberLast4: '8802',
  });

  const categoryRows = await db.select().from(categories).where(eq(categories.companyId, companyId));
  const categoryByCode = new Map(categoryRows.map((c) => [c.code, c]));
  const categoryId = (code: string): string => {
    const found = categoryByCode.get(code);
    if (!found) throw new Error(`Missing seeded category ${code}`);
    return found.id;
  };

  // --- Customers ------------------------------------------------------------
  const customerIds = new Map<string, string>();
  for (const customer of DEMO_CUSTOMERS) {
    const [row] = await db.insert(customers).values({ companyId, ...customer }).returning({ id: customers.id });
    customerIds.set(customer.name, row!.id);
  }

  // --- Suppliers and subcontractors ----------------------------------------
  const supplierIds = new Map<string, string>();
  for (const supplier of DEMO_SUPPLIERS) {
    const [row] = await db
      .insert(suppliers)
      .values({
        companyId,
        name: supplier.name,
        kind: supplier.kind,
        email: 'email' in supplier ? (supplier.email ?? null) : null,
        vatNumber: 'vatNumber' in supplier ? (supplier.vatNumber ?? null) : null,
        defaultCategoryId: categoryId(supplier.categoryCode),
      })
      .returning({ id: suppliers.id });
    supplierIds.set(supplier.name, row!.id);
  }
  for (const sub of DEMO_SUBCONTRACTORS) {
    const [row] = await db
      .insert(suppliers)
      .values({
        companyId,
        name: sub.name,
        kind: 'subcontractor',
        contactName: sub.contactName,
        email: 'email' in sub ? (sub.email ?? null) : null,
        isSubcontractor: true,
        utr: sub.utr,
        cisStatus: sub.cisStatus,
        cisVerificationNumber: sub.cisVerificationNumber,
        cisVerifiedAt: sub.cisVerificationNumber ? new Date() : null,
        cisVerificationSource: sub.cisVerificationNumber ? 'Recorded by the office from HMRC verification' : null,
        defaultCategoryId: categoryId('subcontractors'),
      })
      .returning({ id: suppliers.id });
    supplierIds.set(sub.name, row!.id);
  }

  // --- Jobs -----------------------------------------------------------------
  const jobIds = new Map<string, string>();
  for (const job of DEMO_JOBS) {
    const [row] = await db
      .insert(jobs)
      .values({
        companyId,
        reference: job.reference,
        name: job.name,
        customerId: customerIds.get(job.customerName) ?? null,
        status: job.status,
        siteAddressLine1: job.siteAddressLine1,
        siteCity: job.siteCity,
        sitePostcode: job.sitePostcode,
        description: job.description,
        quotedRevenuePence: job.quotedRevenuePence,
        estimatedCostPence: job.estimatedCostPence,
        startDate: addDays(today, -(job.monthsAgo * 30 + 10)),
        endDate: job.status === 'invoiced' || job.status === 'closed' ? addDays(today, -(job.monthsAgo * 30)) : null,
      })
      .returning({ id: jobs.id });
    jobIds.set(job.reference, row!.id);
  }

  // --- Sales invoices -------------------------------------------------------
  const invoiceRefs: Record<string, { id: string; number: string; grossPence: number }> = {};

  const kowalski = await createInvoice(db, {
    companyId,
    customerId: customerIds.get('Mrs A Kowalski')!,
    jobId: jobIds.get('J-1041')!,
    issueDate: addDays(today, -78),
    lines: [
      {
        description: 'Strip existing roof, dispose of waste, new felt and battens',
        quantityMilli: 1000,
        unitPricePence: 520_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1041')!,
      },
      {
        description: 'Supply and lay reclaimed pantiles',
        quantityMilli: 1000,
        unitPricePence: 465_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1041')!,
      },
      {
        description: 'New leadwork to chimney and abutments',
        quantityMilli: 1000,
        unitPricePence: 300_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1041')!,
      },
    ],
    createdByUserId: ownerId,
  });
  await sendInvoice(db, companyId, kowalski.id, ownerId);
  invoiceRefs.kowalski = { id: kowalski.id, number: kowalski.number, grossPence: kowalski.grossPence };

  const halewood = await createInvoice(db, {
    companyId,
    customerId: customerIds.get('Halewood Property Group')!,
    jobId: jobIds.get('J-1042')!,
    issueDate: addDays(today, -47),
    lines: [
      {
        description: 'Single-ply membrane flat roof, 210m² including insulation upgrade',
        quantityMilli: 1000,
        unitPricePence: 1_980_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1042')!,
      },
      {
        description: 'Scaffold and edge protection',
        quantityMilli: 1000,
        unitPricePence: 320_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1042')!,
      },
    ],
    createdByUserId: ownerId,
  });
  await sendInvoice(db, companyId, halewood.id, ownerId);
  invoiceRefs.halewood = { id: halewood.id, number: halewood.number, grossPence: halewood.grossPence };

  // Overdue invoice — the one the owner needs to chase.
  const parish = await createInvoice(db, {
    companyId,
    customerId: customerIds.get('St Mary’s Parish Council')!,
    jobId: jobIds.get('J-1043')!,
    issueDate: addDays(today, -62),
    dueDate: addDays(today, -32),
    lines: [
      {
        description: 'Replace slipped and broken slates, re-point ridge, renew valley',
        quantityMilli: 1000,
        unitPricePence: 405_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1043')!,
      },
    ],
    createdByUserId: ownerId,
  });
  await sendInvoice(db, companyId, parish.id, ownerId);
  invoiceRefs.parish = { id: parish.id, number: parish.number, grossPence: parish.grossPence };

  // Subcontract work for a main contractor: CIS is deducted from our labour.
  const beckett = await createInvoice(db, {
    companyId,
    customerId: customerIds.get('Beckett Construction Ltd')!,
    jobId: jobIds.get('J-1044')!,
    issueDate: addDays(today, -20),
    lines: [
      {
        description: 'Labour — fascia, soffit and guttering to plots 1–3',
        quantityMilli: 1000,
        unitPricePence: 620_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1044')!,
        isLabour: true,
      },
      {
        description: 'Materials — UPVC fascia, soffit, guttering',
        quantityMilli: 1000,
        unitPricePence: 285_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1044')!,
      },
    ],
    cisDeductionRateBasisPoints: 2000,
    createdByUserId: ownerId,
  });
  await sendInvoice(db, companyId, beckett.id, ownerId);
  invoiceRefs.beckett = { id: beckett.id, number: beckett.number, grossPence: beckett.grossPence };

  const ferris = await createInvoice(db, {
    companyId,
    customerId: customerIds.get('Ferris Lettings')!,
    jobId: jobIds.get('J-1045')!,
    issueDate: addDays(today, -6),
    lines: [
      {
        description: 'Emergency leak trace and repair, second floor flat',
        quantityMilli: 1000,
        unitPricePence: 124_000,
        vatTreatment: 'standard',
        categoryId: categoryId('sales_roofing'),
        jobId: jobIds.get('J-1045')!,
      },
    ],
    createdByUserId: ownerId,
  });
  await sendInvoice(db, companyId, ferris.id, ownerId);
  invoiceRefs.ferris = { id: ferris.id, number: ferris.number, grossPence: ferris.grossPence };

  // --- Purchase bills -------------------------------------------------------
  const scaffoldBill = await createBill(db, {
    companyId,
    supplierId: supplierIds.get('Northern Access Scaffolding')!,
    billDate: addDays(today, -44),
    reference: 'NAS-22418',
    description: 'Scaffold hire — Wellington Street, 6 weeks',
    jobId: jobIds.get('J-1042')!,
    lines: [
      {
        description: 'Scaffold erection and hire, 6 weeks',
        quantityMilli: 1000,
        unitPricePence: 285_000,
        vatTreatment: 'standard',
        categoryId: categoryId('scaffolding'),
        jobId: jobIds.get('J-1042')!,
      },
    ],
    userId: ownerId,
  });

  const doyleBill = await createBill(db, {
    companyId,
    supplierId: supplierIds.get('M Doyle Roofing Services')!,
    billDate: addDays(today, -26),
    reference: 'MD-0912',
    description: 'Roofing labour — Wellington Street flat roof',
    jobId: jobIds.get('J-1042')!,
    isSubcontractorPayment: true,
    lines: [
      {
        description: 'Labour — membrane installation',
        quantityMilli: 1000,
        unitPricePence: 480_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('subcontractors'),
        jobId: jobIds.get('J-1042')!,
        isLabour: true,
      },
      {
        description: 'Materials supplied by subcontractor',
        quantityMilli: 1000,
        unitPricePence: 96_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('materials'),
        jobId: jobIds.get('J-1042')!,
      },
    ],
    userId: ownerId,
  });

  const leadworkBill = await createBill(db, {
    companyId,
    supplierId: supplierIds.get('K & S Leadwork')!,
    billDate: addDays(today, -70),
    reference: 'KS-338',
    description: 'Leadwork — Bramham Road chimney',
    jobId: jobIds.get('J-1041')!,
    isSubcontractorPayment: true,
    lines: [
      {
        description: 'Labour — chimney and abutment leadwork',
        quantityMilli: 1000,
        unitPricePence: 165_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('subcontractors'),
        jobId: jobIds.get('J-1041')!,
        isLabour: true,
      },
    ],
    userId: ownerId,
  });

  const patelBill = await createBill(db, {
    companyId,
    supplierId: supplierIds.get('J Patel Labour')!,
    billDate: addDays(today, -12),
    reference: 'JP-week33',
    description: 'Labour only — Kirkstall Road plots',
    jobId: jobIds.get('J-1044')!,
    isSubcontractorPayment: true,
    lines: [
      {
        description: 'Labour — fascia and soffit fitting, 5 days',
        quantityMilli: 1000,
        unitPricePence: 140_000,
        vatTreatment: 'reverse_charge',
        categoryId: categoryId('subcontractors'),
        jobId: jobIds.get('J-1044')!,
        isLabour: true,
      },
    ],
    userId: ownerId,
  });

  // Awaiting payment, so the owner has something in "Bills to pay".
  await createBill(db, {
    companyId,
    supplierId: supplierIds.get('SIG Roofing')!,
    billDate: addDays(today, -9),
    dueDate: addDays(today, 21),
    reference: 'SIG-INV-771204',
    description: 'Monthly merchant account — August materials',
    jobId: jobIds.get('J-1044')!,
    lines: [
      {
        description: 'UPVC fascia, soffit and guttering — plots 1–3',
        quantityMilli: 1000,
        unitPricePence: 214_500,
        vatTreatment: 'standard',
        categoryId: categoryId('materials'),
        jobId: jobIds.get('J-1044')!,
      },
      {
        description: 'Fixings and sealant',
        quantityMilli: 1000,
        unitPricePence: 18_600,
        vatTreatment: 'standard',
        categoryId: categoryId('materials'),
        jobId: jobIds.get('J-1044')!,
      },
    ],
    userId: ownerId,
  });

  // --- Bank statement -------------------------------------------------------
  const lines: DemoStatementLine[] = [
    // Customer receipts
    {
      date: addDays(today, -70),
      description: `BANK CREDIT KOWALSKI A ${invoiceRefs.kowalski.number}`,
      reference: invoiceRefs.kowalski.number,
      amountPence: invoiceRefs.kowalski.grossPence,
      direction: 'money_in',
    },
    {
      date: addDays(today, -18),
      description: `FASTER PAYMENT HALEWOOD PROPERTY GROUP ${invoiceRefs.halewood.number}`,
      reference: invoiceRefs.halewood.number,
      amountPence: 1_500_000,
      direction: 'money_in',
    },
    // Materials — matched by supplier name
    { date: addDays(today, -76), description: 'CARD PURCHASE TRAVIS PERKINS LEEDS 4471', amountPence: 148_620, direction: 'money_out' },
    { date: addDays(today, -74), description: 'CARD PURCHASE SIG ROOFING LEEDS 4471', amountPence: 386_400, direction: 'money_out' },
    { date: addDays(today, -55), description: 'CARD PURCHASE BURTON ROOFING MERCHANTS 4471', amountPence: 92_340, direction: 'money_out' },
    { date: addDays(today, -41), description: 'CARD PURCHASE SIG ROOFING LEEDS 4471', amountPence: 742_800, direction: 'money_out' },
    { date: addDays(today, -30), description: 'CARD PURCHASE TRAVIS PERKINS LEEDS 4471', amountPence: 63_180, direction: 'money_out' },
    { date: addDays(today, -9), description: 'CARD PURCHASE TRAVIS PERKINS LEEDS 4471', amountPence: 27_540, direction: 'money_out' },
    // Scaffolding bill settlement
    { date: addDays(today, -30), description: 'FASTER PAYMENT NORTHERN ACCESS SCAFFOLDING', reference: 'NAS-22418', amountPence: 342_000, direction: 'money_out' },
    // Subcontractor payments, net of CIS
    { date: addDays(today, -64), description: 'FASTER PAYMENT K & S LEADWORK', reference: 'KS-338', amountPence: 132_000, direction: 'money_out' },
    { date: addDays(today, -20), description: 'FASTER PAYMENT M DOYLE ROOFING SERVICES', reference: 'MD-0912', amountPence: 480_000, direction: 'money_out' },
    { date: addDays(today, -8), description: 'FASTER PAYMENT J PATEL LABOUR', reference: 'JP-week33', amountPence: 98_000, direction: 'money_out' },
    // Running costs
    { date: addDays(today, -68), description: 'CARD PURCHASE SHELL LEEDS RING ROAD 4471', amountPence: 9_840, direction: 'money_out' },
    { date: addDays(today, -52), description: 'CARD PURCHASE SHELL LEEDS RING ROAD 4471', amountPence: 11_260, direction: 'money_out' },
    { date: addDays(today, -33), description: 'CARD PURCHASE SHELL LEEDS RING ROAD 4471', amountPence: 10_450, direction: 'money_out' },
    { date: addDays(today, -14), description: 'CARD PURCHASE SHELL LEEDS RING ROAD 4471', amountPence: 12_180, direction: 'money_out' },
    { date: addDays(today, -60), description: 'DIRECT DEBIT TRADE DIRECT INSURANCE', amountPence: 142_800, direction: 'money_out' },
    { date: addDays(today, -60), description: 'DIRECT DEBIT VODAFONE BUSINESS', amountPence: 8_640, direction: 'money_out' },
    { date: addDays(today, -30), description: 'DIRECT DEBIT VODAFONE BUSINESS', amountPence: 8_640, direction: 'money_out' },
    { date: addDays(today, -35), description: 'CARD PURCHASE SKIP IT WASTE SERVICES 4471', amountPence: 39_600, direction: 'money_out' },
    // Ambiguous — these become Ask Me questions
    { date: addDays(today, -21), description: 'FASTER PAYMENT SMITH SERVICES', amountPence: 28_700, direction: 'money_out' },
    { date: addDays(today, -11), description: 'CARD PURCHASE HW TOOLS AND FIXINGS 4471', amountPence: 18_495, direction: 'money_out' },
    { date: addDays(today, -4), description: 'FASTER PAYMENT J WHITAKER', amountPence: 120_000, direction: 'money_out' },
    { date: addDays(today, -2), description: 'BANK CREDIT UNKNOWN PAYER REF 88213', reference: '88213', amountPence: 45_000, direction: 'money_in' },
    // Bank charge
    { date: addDays(today, -31), description: 'ACCOUNT FEE', amountPence: 1_000, direction: 'money_out' },
  ];

  const statementCsv = buildStatementCsv(lines, 1_240_000);
  const importResult = await importStatement(db, {
    companyId,
    bankAccountId: currentAccountId,
    filename: 'demo-statement.csv',
    content: statementCsv,
    userId: ownerId,
    skipAutoProcess: true,
  });

  // --- Link payments to their documents ------------------------------------
  const allTransactions = await db
    .select()
    .from(transactions)
    .where(eq(transactions.companyId, companyId));

  const findTransaction = (needle: string, amountPence?: number) =>
    allTransactions.find(
      (t) =>
        t.description.toLowerCase().includes(needle.toLowerCase()) &&
        (amountPence === undefined || t.amountPence === amountPence),
    );

  const kowalskiReceipt = findTransaction('KOWALSKI');
  if (kowalskiReceipt) {
    const paymentId = await recordPayment(db, {
      companyId,
      direction: 'customer_receipt',
      customerId: customerIds.get('Mrs A Kowalski')!,
      paymentDate: kowalskiReceipt.transactionDate,
      amountPence: kowalskiReceipt.amountPence,
      reference: invoiceRefs.kowalski.number,
      transactionId: kowalskiReceipt.id,
      allocations: [{ invoiceId: invoiceRefs.kowalski.id, amountPence: kowalskiReceipt.amountPence }],
      userId: ownerId,
    });
    await linkTransaction(db, companyId, {
      transactionId: kowalskiReceipt.id,
      linkedType: 'invoice',
      linkedId: invoiceRefs.kowalski.id,
      amountPence: kowalskiReceipt.amountPence,
      source: 'user',
    });
    await linkTransaction(db, companyId, {
      transactionId: kowalskiReceipt.id,
      linkedType: 'payment',
      linkedId: paymentId,
      amountPence: kowalskiReceipt.amountPence,
      source: 'user',
    });
  }

  const halewoodReceipt = findTransaction('HALEWOOD');
  if (halewoodReceipt) {
    const paymentId = await recordPayment(db, {
      companyId,
      direction: 'customer_receipt',
      customerId: customerIds.get('Halewood Property Group')!,
      paymentDate: halewoodReceipt.transactionDate,
      amountPence: halewoodReceipt.amountPence,
      reference: invoiceRefs.halewood.number,
      transactionId: halewoodReceipt.id,
      allocations: [{ invoiceId: invoiceRefs.halewood.id, amountPence: halewoodReceipt.amountPence }],
      userId: ownerId,
    });
    await linkTransaction(db, companyId, {
      transactionId: halewoodReceipt.id,
      linkedType: 'invoice',
      linkedId: invoiceRefs.halewood.id,
      amountPence: halewoodReceipt.amountPence,
      source: 'user',
    });
    await linkTransaction(db, companyId, {
      transactionId: halewoodReceipt.id,
      linkedType: 'payment',
      linkedId: paymentId,
      amountPence: halewoodReceipt.amountPence,
      source: 'user',
    });
  }

  for (const [needle, bill] of [
    ['NORTHERN ACCESS SCAFFOLDING', scaffoldBill],
    ['K & S LEADWORK', leadworkBill],
    ['M DOYLE', doyleBill],
    ['J PATEL', patelBill],
  ] as const) {
    const transaction = findTransaction(needle);
    if (!transaction) continue;
    await recordPayment(db, {
      companyId,
      direction: 'supplier_payment',
      supplierId: bill.supplierId,
      paymentDate: transaction.transactionDate,
      amountPence: transaction.amountPence,
      reference: bill.reference,
      transactionId: transaction.id,
      allocations: [{ billId: bill.id, amountPence: transaction.amountPence }],
      userId: ownerId,
    });
    await linkTransaction(db, companyId, {
      transactionId: transaction.id,
      linkedType: 'bill',
      linkedId: bill.id,
      amountPence: transaction.amountPence,
      source: 'user',
    });
    await refreshBillStatus(db, companyId, bill.id);
  }

  // --- Categorisation pass --------------------------------------------------
  for (const transaction of allTransactions) {
    await autoProcessTransaction(db, companyId, transaction.id, { allowAi: false });
  }

  await refreshInvoiceStatus(db, companyId, invoiceRefs.kowalski.id);
  await refreshInvoiceStatus(db, companyId, invoiceRefs.halewood.id);
  await refreshInvoiceStatus(db, companyId, invoiceRefs.parish.id);
  await refreshInvoiceStatus(db, companyId, invoiceRefs.beckett.id);
  await refreshInvoiceStatus(db, companyId, invoiceRefs.ferris.id);

  // --- Receipts -------------------------------------------------------------
  const receipts: { filename: string; content: string }[] = [
    {
      filename: 'travis-perkins-receipt.txt',
      content: buildTextReceipt({
        supplier: 'Travis Perkins',
        address: 'Gelderd Road, Leeds LS12 6BX',
        date: addDays(today, -76),
        vatNumber: 'GB408216160',
        items: [
          { description: 'Treated batten 25x38mm x 4.8m (50)', amountPence: 68_500 },
          { description: 'Roofing felt 1m x 10m (12)', amountPence: 55_350 },
        ],
      }),
    },
    {
      filename: 'sig-roofing-receipt.txt',
      content: buildTextReceipt({
        supplier: 'SIG Roofing',
        address: 'Sweet Street, Leeds LS11 9DA',
        date: addDays(today, -74),
        items: [{ description: 'Reclaimed pantiles (1,200)', amountPence: 322_000 }],
      }),
    },
    {
      filename: 'skip-it-receipt.txt',
      content: buildTextReceipt({
        supplier: 'Skip It Waste Services',
        date: addDays(today, -35),
        items: [{ description: '8 yard skip hire and disposal', amountPence: 33_000 }],
      }),
    },
    {
      filename: 'hw-tools-receipt.txt',
      content: buildTextReceipt({
        supplier: 'HW Tools and Fixings',
        date: addDays(today, -11),
        items: [
          { description: 'Impact driver bits set', amountPence: 4_995 },
          { description: 'Roofing screws box (500)', amountPence: 10_417 },
        ],
      }),
    },
    {
      filename: 'shell-fuel-receipt.txt',
      content: buildTextReceipt({
        supplier: 'Shell Leeds Ring Road',
        date: addDays(today, -14),
        items: [{ description: 'Diesel 71.4 litres', amountPence: 10_150 }],
      }),
    },
  ];

  let receiptsUploaded = 0;
  for (const receipt of receipts) {
    await uploadReceipt(db, {
      companyId,
      userId: ownerId,
      filename: receipt.filename,
      contentType: 'text/plain',
      buffer: Buffer.from(receipt.content, 'utf8'),
    });
    receiptsUploaded += 1;
  }

  // Purchases over the threshold with no receipt become Ask Me questions.
  await flagMissingReceipts(db, companyId, { thresholdPence: 15_000 });

  const counts = {
    customers: DEMO_CUSTOMERS.length,
    suppliers: DEMO_SUPPLIERS.length + DEMO_SUBCONTRACTORS.length,
    jobs: DEMO_JOBS.length,
    invoices: 5,
    bills: 5,
    transactions: importResult.imported,
    receipts: receiptsUploaded,
  };

  return {
    companyId,
    users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role })),
    counts,
  };
}

async function main() {
  const environment = loadEnv();
  const db = createDatabase();
  const result = await seedDemo(db, { password: environment.SEED_DEMO_PASSWORD });
  if (result.counts.skipped) {
    console.log('Demo company already present — nothing to do.');
  } else {
    console.log('Demo data created.');
    console.table(result.counts);
  }
  console.log('\nSign in with any of these (password from SEED_DEMO_PASSWORD):');
  for (const user of result.users) console.log(`  ${user.email}  (${user.role})`);
  process.exit(0);
}

if (process.argv[1]?.includes('seed')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
