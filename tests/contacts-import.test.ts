import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { customers, suppliers } from '@/db/schema';
import { importCustomersCsv, importSuppliersCsv } from '@/domain/import-contacts';
import { flagSuspectedDuplicates } from '@/domain/transactions';
import { importStatement } from '@/domain/import';
import { listOpenExceptions } from '@/domain/exceptions';
import { ValidationError } from '@/lib/errors';

let db: Database;
let fixture: Fixture;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
});

describe('importing customers', () => {
  it('reads a spreadsheet however the columns are named', async () => {
    const csv = [
      'Customer Name,Contact,Email Address,Telephone,Address 1,Town,Postcode,Payment Terms',
      'Halewood Property Group,Janet Hale,accounts@halewood.example,0113 496 1120,18 Wellington St,Leeds,LS1 4HW,30 days',
      'Mrs A Kowalski,,anna@example.com,,42 Bramham Road,Wetherby,LS22 6RN,14',
    ].join('\n');

    const result = await importCustomersCsv(db, fixture.companyId, csv, fixture.ownerId);
    expect(result.created).toBe(2);
    expect(result.errors).toHaveLength(0);

    const rows = await db.select().from(customers).where(eq(customers.companyId, fixture.companyId));
    const halewood = rows.find((r) => r.name === 'Halewood Property Group');
    expect(halewood?.email).toBe('accounts@halewood.example');
    expect(halewood?.paymentTermsDays).toBe(30);
    expect(rows.find((r) => r.name === 'Mrs A Kowalski')?.paymentTermsDays).toBe(14);
  });

  it('updates rather than duplicates when the same file is imported again', async () => {
    const first = 'Name,Email\nHalewood Property Group,old@example.com';
    const second = 'Name,Email\nHalewood Property Group,new@example.com';

    await importCustomersCsv(db, fixture.companyId, first, fixture.ownerId);
    const result = await importCustomersCsv(db, fixture.companyId, second, fixture.ownerId);

    expect(result.created).toBe(0);
    expect(result.updated).toBe(1);
    const rows = await db.select().from(customers).where(eq(customers.companyId, fixture.companyId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe('new@example.com');
  });

  it('skips rows with no name, and ignores blank lines entirely', async () => {
    const csv = 'Name,Email\nReal Customer,a@example.com\n,b@example.com\n,\n\n';
    const result = await importCustomersCsv(db, fixture.companyId, csv, fixture.ownerId);
    expect(result.created).toBe(1);
    // The row with an email but no name is reported as skipped; the wholly
    // blank lines are not counted at all.
    expect(result.skipped).toBe(1);
  });

  it('explains itself when there is no name column', async () => {
    await expect(
      importCustomersCsv(db, fixture.companyId, 'Foo,Bar\n1,2', fixture.ownerId),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('keeps each company separate', async () => {
    await importCustomersCsv(db, fixture.companyId, 'Name\nShared Name', fixture.ownerId);
    await importCustomersCsv(db, fixture.otherCompanyId, 'Name\nShared Name', fixture.otherOwnerId);

    const mine = await db.select().from(customers).where(eq(customers.companyId, fixture.companyId));
    const theirs = await db
      .select()
      .from(customers)
      .where(eq(customers.companyId, fixture.otherCompanyId));
    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(mine[0]!.id).not.toBe(theirs[0]!.id);
  });
});

describe('importing suppliers', () => {
  it('treats a row with a UTR or CIS status as a subcontractor', async () => {
    const csv = [
      'Name,Email,VAT Number,UTR,CIS Status,Category',
      'Travis Perkins,leeds@travis.example,GB408216160,,,Materials',
      'M Doyle Roofing,mick@doyle.example,,4536271890,20%,Subcontractors',
      'J Patel Labour,,,,unverified,Subcontractors',
    ].join('\n');

    const result = await importSuppliersCsv(db, fixture.companyId, csv, fixture.ownerId);
    expect(result.created).toBe(3);

    const rows = await db.select().from(suppliers).where(eq(suppliers.companyId, fixture.companyId));
    const travis = rows.find((r) => r.name === 'Travis Perkins')!;
    const doyle = rows.find((r) => r.name === 'M Doyle Roofing')!;
    const patel = rows.find((r) => r.name === 'J Patel Labour')!;

    expect(travis.isSubcontractor).toBe(false);
    expect(travis.vatNumber).toBe('GB408216160');
    expect(travis.defaultCategoryId).not.toBeNull();

    expect(doyle.isSubcontractor).toBe(true);
    expect(doyle.utr).toBe('4536271890');
    expect(doyle.cisStatus).toBe('net_20');

    expect(patel.isSubcontractor).toBe(true);
    expect(patel.cisStatus).toBe('unknown');
  });

  it('reads the CIS rate however it is written', async () => {
    const csv = [
      'Name,CIS Status',
      'Gross Sub,gross',
      'Twenty Sub,net 20',
      'Thirty Sub,30%',
    ].join('\n');
    await importSuppliersCsv(db, fixture.companyId, csv, fixture.ownerId);
    const rows = await db.select().from(suppliers).where(eq(suppliers.companyId, fixture.companyId));
    expect(rows.find((r) => r.name === 'Gross Sub')?.cisStatus).toBe('gross');
    expect(rows.find((r) => r.name === 'Twenty Sub')?.cisStatus).toBe('net_20');
    expect(rows.find((r) => r.name === 'Thirty Sub')?.cisStatus).toBe('net_30');
  });
});

describe('suspected duplicates', () => {
  it('asks about a statement line that appears twice on the same day', async () => {
    const csv = [
      'Date,Description,Paid out',
      '01/05/2026,CARD PURCHASE SHELL LEEDS,50.00',
      '01/05/2026,CARD PURCHASE SHELL LEEDS,50.00',
    ].join('\n');

    const result = await importStatement(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      filename: 'shell.csv',
      content: csv,
      userId: fixture.ownerId,
    });
    expect(result.imported).toBe(2);

    const open = await listOpenExceptions(db, fixture.companyId);
    const duplicate = open.find((e) => e.type === 'duplicate_suspected');
    expect(duplicate).toBeDefined();
    expect(duplicate!.question).toContain('twice');
    expect(duplicate!.candidates.map((c) => c.id)).toContain('both-real');
  });

  it('does not question two different payments on the same day', async () => {
    const csv = [
      'Date,Description,Paid out',
      '01/05/2026,CARD PURCHASE SHELL LEEDS,50.00',
      '01/05/2026,CARD PURCHASE TRAVIS PERKINS,50.00',
    ].join('\n');

    await importStatement(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      filename: 'mixed.csv',
      content: csv,
      userId: fixture.ownerId,
    });

    const open = await listOpenExceptions(db, fixture.companyId);
    expect(open.some((e) => e.type === 'duplicate_suspected')).toBe(false);
  });

  it('does nothing when given nothing', async () => {
    expect(await flagSuspectedDuplicates(db, fixture.companyId, [])).toBe(0);
  });
});
