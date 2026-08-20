import { execSync } from 'node:child_process';
import { sql } from 'drizzle-orm';
import { createDatabase, type Database } from '@/db/client';
import { addBankAccount, addMember, createCompany, createUser } from '@/domain/company';

let migrated = false;

export function testDb(): Database {
  if (!migrated) {
    execSync('npx tsx src/db/migrate.ts', { stdio: 'pipe', env: { ...process.env } });
    migrated = true;
  }
  return createDatabase();
}

const TABLES = [
  'journal_lines',
  'journal_entries',
  'ledger_accounts',
  'payment_allocations',
  'payments',
  'invoice_lines',
  'invoices',
  'bill_lines',
  'bills',
  'cis_statements',
  'cis_periods',
  'vat_periods',
  'transaction_links',
  'documents',
  'transactions',
  'import_batches',
  'exceptions',
  'rules',
  'audit_events',
  'outbox_messages',
  'external_mappings',
  'integration_connections',
  'jobs',
  'categories',
  'bank_accounts',
  'customers',
  'suppliers',
  'sessions',
  'memberships',
  'companies',
  'users',
];

export async function resetDatabase(db: Database): Promise<void> {
  await db.execute(sql.raw(`truncate table ${TABLES.join(', ')} restart identity cascade`));
}

export type Fixture = {
  companyId: string;
  otherCompanyId: string;
  ownerId: string;
  otherOwnerId: string;
  bankAccountId: string;
  otherBankAccountId: string;
};

/** Two tenants, so every test can prove isolation cheaply. */
export async function seedTwoCompanies(db: Database): Promise<Fixture> {
  const companyId = await createCompany(db, {
    name: 'Test Roofing Ltd',
    vatRegistered: true,
    cisContractor: true,
  });
  const otherCompanyId = await createCompany(db, { name: 'Rival Roofing Ltd', vatRegistered: true });

  const ownerId = await createUser(db, {
    email: 'owner@test.example',
    name: 'Test Owner',
    password: 'TestPassw0rd!',
  });
  const otherOwnerId = await createUser(db, {
    email: 'rival@test.example',
    name: 'Rival Owner',
    password: 'TestPassw0rd!',
  });

  await addMember(db, companyId, ownerId, 'owner', { isDefault: true });
  await addMember(db, otherCompanyId, otherOwnerId, 'owner', { isDefault: true });

  const bankAccountId = await addBankAccount(db, companyId, {
    name: 'Current',
    openingBalancePence: 100_000,
  });
  const otherBankAccountId = await addBankAccount(db, otherCompanyId, { name: 'Current' });

  return { companyId, otherCompanyId, ownerId, otherOwnerId, bankAccountId, otherBankAccountId };
}

export async function categoryIdByCode(db: Database, companyId: string, code: string): Promise<string> {
  const { categories } = await import('@/db/schema');
  const { and, eq } = await import('drizzle-orm');
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.companyId, companyId), eq(categories.code, code)))
    .limit(1);
  if (!rows[0]) throw new Error(`Missing category ${code}`);
  return rows[0].id;
}
