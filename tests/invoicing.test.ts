import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { categoryIdByCode, resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { customers, journalLines, suppliers } from '@/db/schema';
import {
  allocatePayment,
  calculateInvoiceTotals,
  createInvoice,
  getInvoice,
  outstandingPence,
  recordPayment,
  refreshInvoiceStatus,
  sendInvoice,
  voidInvoice,
} from '@/domain/invoices';
import { calculateBillTotals, calculateCisDeduction, createBill, refreshBillStatus } from '@/domain/bills';
import { AppError } from '@/lib/errors';
import { trialBalance } from '@/domain/exports';

let db: Database;
let fixture: Fixture;
let customerId: string;
let salesCategoryId: string;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
  const [customer] = await db
    .insert(customers)
    .values({ companyId: fixture.companyId, name: 'Halewood Property', paymentTermsDays: 30 })
    .returning({ id: customers.id });
  customerId = customer!.id;
  salesCategoryId = await categoryIdByCode(db, fixture.companyId, 'sales_roofing');
});

function line(unitPricePence: number, vatTreatment: 'standard' | 'zero' | 'reverse_charge' = 'standard', isLabour = false) {
  return {
    description: 'Roofing work',
    quantityMilli: 1000,
    unitPricePence,
    vatTreatment,
    categoryId: salesCategoryId,
    isLabour,
  };
}

describe('invoice totals', () => {
  it('adds VAT per line and never loses a penny', () => {
    const totals = calculateInvoiceTotals([line(33_333), line(1), line(999)]);
    expect(totals.netPence).toBe(34_333);
    expect(totals.vatPence).toBe(6_667 + 0 + 200 - 0);
    expect(totals.grossPence).toBe(totals.netPence + totals.vatPence);
    for (const l of totals.lines) {
      expect(l.grossPence).toBe(l.netPence + l.vatPence);
    }
  });

  it('handles fractional quantities', () => {
    const totals = calculateInvoiceTotals([
      { description: 'Day rate', quantityMilli: 2500, unitPricePence: 24_000, vatTreatment: 'standard' },
    ]);
    expect(totals.netPence).toBe(60_000);
    expect(totals.vatPence).toBe(12_000);
  });

  it('charges no VAT on reverse-charge lines', () => {
    const totals = calculateInvoiceTotals([line(100_000, 'reverse_charge')]);
    expect(totals.vatPence).toBe(0);
    expect(totals.grossPence).toBe(100_000);
  });
});

describe('invoice lifecycle', () => {
  it('goes draft -> sent -> part paid -> paid as payments arrive', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(100_000)],
      createdByUserId: fixture.ownerId,
    });
    expect(invoice.status).toBe('draft');
    expect(invoice.grossPence).toBe(120_000);
    expect(invoice.dueDate).toBe('2026-05-31');

    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    const sent = await refreshInvoiceStatus(db, fixture.companyId, invoice.id, '2026-05-02');
    expect(sent.status).toBe('sent');
    expect(sent.sentAt).not.toBeNull();

    const paymentId = await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'customer_receipt',
      customerId,
      paymentDate: '2026-05-10',
      amountPence: 50_000,
      allocations: [{ invoiceId: invoice.id, amountPence: 50_000 }],
      userId: fixture.ownerId,
    });
    let current = await refreshInvoiceStatus(db, fixture.companyId, invoice.id, '2026-05-11');
    expect(current.status).toBe('part_paid');
    expect(current.paidPence).toBe(50_000);
    expect(outstandingPence(current)).toBe(70_000);

    await allocatePayment(
      db,
      fixture.companyId,
      paymentId,
      [],
      fixture.ownerId,
    );

    await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'customer_receipt',
      customerId,
      paymentDate: '2026-05-20',
      amountPence: 70_000,
      allocations: [{ invoiceId: invoice.id, amountPence: 70_000 }],
      userId: fixture.ownerId,
    });
    current = await refreshInvoiceStatus(db, fixture.companyId, invoice.id, '2026-05-21');
    expect(current.status).toBe('paid');
    expect(outstandingPence(current)).toBe(0);
  });

  it('becomes overdue once the due date passes', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-01-01',
      dueDate: '2026-01-15',
      lines: [line(50_000)],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    const overdue = await refreshInvoiceStatus(db, fixture.companyId, invoice.id, '2026-02-01');
    expect(overdue.status).toBe('overdue');
    const notYet = await refreshInvoiceStatus(db, fixture.companyId, invoice.id, '2026-01-10');
    expect(notYet.status).toBe('sent');
  });

  it('refuses to allocate more than the payment', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(100_000)],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    const paymentId = await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'customer_receipt',
      customerId,
      paymentDate: '2026-05-10',
      amountPence: 10_000,
      userId: fixture.ownerId,
    });
    await expect(
      allocatePayment(
        db,
        fixture.companyId,
        paymentId,
        [{ invoiceId: invoice.id, amountPence: 20_000 }],
        fixture.ownerId,
      ),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('refuses to cancel an invoice that has been paid', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(10_000)],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'customer_receipt',
      customerId,
      paymentDate: '2026-05-02',
      amountPence: 12_000,
      allocations: [{ invoiceId: invoice.id, amountPence: 12_000 }],
      userId: fixture.ownerId,
    });
    await expect(
      voidInvoice(db, fixture.companyId, invoice.id, fixture.ownerId, 'mistake'),
    ).rejects.toBeInstanceOf(AppError);
  });

  it('deducts CIS from labour when invoicing a contractor', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(620_000, 'reverse_charge', true), line(285_000, 'reverse_charge', false)],
      cisDeductionRateBasisPoints: 2000,
      createdByUserId: fixture.ownerId,
    });
    expect(invoice.cisDeductionPence).toBe(124_000);
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    const current = await getInvoice(db, fixture.companyId, invoice.id);
    // The customer pays the invoice less the CIS they withhold.
    expect(outstandingPence(current)).toBe(905_000 - 124_000);
  });
});

describe('CIS on subcontractor bills', () => {
  it('deducts only from the labour element, excluding materials and VAT', () => {
    expect(calculateCisDeduction({ labourNetPence: 480_000, rateBasisPoints: 2000 })).toBe(96_000);
    expect(calculateCisDeduction({ labourNetPence: 480_000, rateBasisPoints: 3000 })).toBe(144_000);
    expect(calculateCisDeduction({ labourNetPence: 480_000, rateBasisPoints: 0 })).toBe(0);
    expect(calculateCisDeduction({ labourNetPence: 33_333, rateBasisPoints: 2000 })).toBe(6_667);
  });

  it('records the split and the net amount payable on the bill', async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({
        companyId: fixture.companyId,
        name: 'M Doyle Roofing',
        kind: 'subcontractor',
        isSubcontractor: true,
        cisStatus: 'net_20',
        utr: '4536271890',
      })
      .returning({ id: suppliers.id });

    const materialsCategoryId = await categoryIdByCode(db, fixture.companyId, 'materials');
    const labourCategoryId = await categoryIdByCode(db, fixture.companyId, 'subcontractors');

    const bill = await createBill(db, {
      companyId: fixture.companyId,
      supplierId: supplier!.id,
      billDate: '2026-05-01',
      lines: [
        {
          description: 'Labour',
          quantityMilli: 1000,
          unitPricePence: 480_000,
          vatTreatment: 'reverse_charge',
          categoryId: labourCategoryId,
          isLabour: true,
        },
        {
          description: 'Materials',
          quantityMilli: 1000,
          unitPricePence: 96_000,
          vatTreatment: 'reverse_charge',
          categoryId: materialsCategoryId,
        },
      ],
      userId: fixture.ownerId,
    });

    expect(bill.cisLabourPence).toBe(480_000);
    expect(bill.cisMaterialsPence).toBe(96_000);
    expect(bill.cisDeductionPence).toBe(96_000);
    expect(bill.grossPence).toBe(576_000);

    await recordPayment(db, {
      companyId: fixture.companyId,
      direction: 'supplier_payment',
      supplierId: supplier!.id,
      paymentDate: '2026-05-15',
      amountPence: 480_000,
      allocations: [{ billId: bill.id, amountPence: 480_000 }],
      userId: fixture.ownerId,
    });
    const settled = await refreshBillStatus(db, fixture.companyId, bill.id);
    expect(settled.status).toBe('paid');
  });

  it('uses the higher rate for an unverified subcontractor', async () => {
    const [supplier] = await db
      .insert(suppliers)
      .values({
        companyId: fixture.companyId,
        name: 'J Patel Labour',
        kind: 'subcontractor',
        isSubcontractor: true,
        cisStatus: 'unknown',
      })
      .returning({ id: suppliers.id });

    const bill = await createBill(db, {
      companyId: fixture.companyId,
      supplierId: supplier!.id,
      billDate: '2026-05-01',
      lines: [
        {
          description: 'Labour',
          quantityMilli: 1000,
          unitPricePence: 100_000,
          vatTreatment: 'reverse_charge',
          isLabour: true,
        },
      ],
      userId: fixture.ownerId,
    });
    expect(bill.cisDeductionRateBasisPoints).toBe(3000);
    expect(bill.cisDeductionPence).toBe(30_000);
  });
});

describe('bill totals', () => {
  it('adds VAT per line', () => {
    const totals = calculateBillTotals([
      { description: 'Tiles', quantityMilli: 1000, unitPricePence: 123_850, vatTreatment: 'standard' },
    ]);
    expect(totals.vatPence).toBe(24_770);
    expect(totals.grossPence).toBe(148_620);
  });
});

describe('internal journal', () => {
  it('keeps debits equal to credits after a full sales cycle', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(100_000), line(33_333)],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);

    const balance = await trialBalance(db, fixture.companyId);
    expect(balance.balanced).toBe(true);
    expect(balance.totalDebitPence).toBeGreaterThan(0);

    const lines = await db
      .select()
      .from(journalLines)
      .where(eq(journalLines.companyId, fixture.companyId));
    expect(lines.reduce((sum, l) => sum + l.amountPence, 0)).toBe(0);
  });

  it('removes the posting when an invoice is cancelled', async () => {
    const invoice = await createInvoice(db, {
      companyId: fixture.companyId,
      customerId,
      issueDate: '2026-05-01',
      lines: [line(100_000)],
      createdByUserId: fixture.ownerId,
    });
    await sendInvoice(db, fixture.companyId, invoice.id, fixture.ownerId);
    await voidInvoice(db, fixture.companyId, invoice.id, fixture.ownerId, 'duplicate');

    const balance = await trialBalance(db, fixture.companyId);
    expect(balance.totalDebitPence).toBe(0);
    expect(balance.balanced).toBe(true);
  });
});
