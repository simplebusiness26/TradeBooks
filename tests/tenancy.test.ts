import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { categoryIdByCode, resetDatabase, seedTwoCompanies, testDb, type Fixture } from './helpers/db';
import type { Database } from '@/db/client';
import { transactions } from '@/db/schema';
import { applyCategorisation, createTransaction, getTransaction } from '@/domain/transactions';
import { NotFoundError } from '@/lib/errors';
import { can } from '@/lib/permissions';
import { hashPassword, verifyPassword } from '@/lib/password';
import { generateSessionToken, hashSessionToken } from '@/lib/session';

let db: Database;
let fixture: Fixture;

beforeAll(() => {
  db = testDb();
});

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedTwoCompanies(db);
});

describe('tenant isolation', () => {
  it('will not read another company record even with a valid id', async () => {
    const created = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-01',
      direction: 'money_out',
      amountPence: 12_000,
      description: 'TRAVIS PERKINS LEEDS',
    });

    await expect(getTransaction(db, fixture.otherCompanyId, created.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(getTransaction(db, fixture.companyId, created.id)).resolves.toMatchObject({
      amountPence: 12_000,
    });
  });

  it('will not write to another company record', async () => {
    const created = await createTransaction(db, {
      companyId: fixture.companyId,
      bankAccountId: fixture.bankAccountId,
      transactionDate: '2026-05-01',
      direction: 'money_out',
      amountPence: 5_000,
      description: 'SIG ROOFING',
    });
    const categoryId = await categoryIdByCode(db, fixture.companyId, 'materials');

    await expect(
      applyCategorisation(db, fixture.otherCompanyId, created.id, {
        categoryId,
        source: 'user',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const row = await getTransaction(db, fixture.companyId, created.id);
    expect(row.categoryId).toBeNull();
  });

  it('will not attach a record to a bank account belonging to another company', async () => {
    await expect(
      createTransaction(db, {
        companyId: fixture.companyId,
        bankAccountId: fixture.otherBankAccountId,
        transactionDate: '2026-05-01',
        direction: 'money_out',
        amountPence: 1_000,
        description: 'CROSS TENANT',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('gives each company its own categories', async () => {
    const a = await categoryIdByCode(db, fixture.companyId, 'materials');
    const b = await categoryIdByCode(db, fixture.otherCompanyId, 'materials');
    expect(a).not.toBe(b);
  });

  it('keeps the same statement line separate for each company', async () => {
    const shared = {
      transactionDate: '2026-05-01' as const,
      direction: 'money_out' as const,
      amountPence: 9_999,
      description: 'IDENTICAL DESCRIPTION',
    };
    await createTransaction(db, { ...shared, companyId: fixture.companyId, bankAccountId: fixture.bankAccountId });
    await createTransaction(db, {
      ...shared,
      companyId: fixture.otherCompanyId,
      bankAccountId: fixture.otherBankAccountId,
    });

    const mine = await db
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, fixture.companyId));
    const theirs = await db
      .select()
      .from(transactions)
      .where(eq(transactions.companyId, fixture.otherCompanyId));

    expect(mine).toHaveLength(1);
    expect(theirs).toHaveLength(1);
    expect(mine[0]!.id).not.toBe(theirs[0]!.id);
  });
});

describe('role permissions', () => {
  it('lets owners and admins change company settings but not staff or reviewers', () => {
    expect(can('owner', 'company.settings')).toBe(true);
    expect(can('admin', 'company.settings')).toBe(true);
    expect(can('staff', 'company.settings')).toBe(false);
    expect(can('reviewer', 'company.settings')).toBe(false);
  });

  it('lets a reviewer prepare periods and read the audit trail', () => {
    expect(can('reviewer', 'periods.prepare')).toBe(true);
    expect(can('reviewer', 'audit.read')).toBe(true);
    expect(can('reviewer', 'company.members')).toBe(false);
  });

  it('does not let staff delete records or manage integrations', () => {
    expect(can('staff', 'records.delete')).toBe(false);
    expect(can('staff', 'integrations.manage')).toBe(false);
    expect(can('staff', 'records.write')).toBe(true);
  });
});

describe('credential handling', () => {
  it('stores passwords as salted scrypt hashes and verifies them', async () => {
    const hash = await hashPassword('CorrectHorse99!');
    expect(hash).not.toContain('CorrectHorse99!');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('CorrectHorse99!', hash)).toBe(true);
    expect(await verifyPassword('correcthorse99!', hash)).toBe(false);
    expect(await verifyPassword('', hash)).toBe(false);
  });

  it('produces a different hash for the same password each time', async () => {
    const a = await hashPassword('CorrectHorse99!');
    const b = await hashPassword('CorrectHorse99!');
    expect(a).not.toBe(b);
  });

  it('rejects a malformed stored hash instead of throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2$3$4$')).toBe(false);
  });

  it('never stores the raw session token', () => {
    const token = generateSessionToken();
    const stored = hashSessionToken(token);
    expect(stored).not.toBe(token);
    expect(stored).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(stored);
  });
});
