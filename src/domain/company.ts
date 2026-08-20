import { and, eq } from 'drizzle-orm';
import type { Database } from '@/db/client';
import { bankAccounts, companies, integrationConnections, memberships, users } from '@/db/schema';
import { hashPassword } from '@/lib/password';
import { AppError, ConflictError, NotFoundError } from '@/lib/errors';
import { ensureSystemAccounts } from './ledger';
import { seedDefaultCategories } from './categories';
import { recordAudit } from './audit';
import type { Role } from '@/lib/permissions';

export type CreateCompanyInput = {
  name: string;
  tradingName?: string | null;
  trade?: string;
  vatRegistered?: boolean;
  vatNumber?: string | null;
  cisContractor?: boolean;
  cisSubcontractor?: boolean;
  isDemo?: boolean;
};

/** Creates a tenant with its chart of accounts, categories and integration rows. */
export async function createCompany(db: Database, input: CreateCompanyInput): Promise<string> {
  const [company] = await db
    .insert(companies)
    .values({
      name: input.name,
      tradingName: input.tradingName ?? null,
      trade: input.trade ?? 'roofing',
      vatRegistered: input.vatRegistered ?? false,
      vatNumber: input.vatNumber ?? null,
      cisContractor: input.cisContractor ?? false,
      cisSubcontractor: input.cisSubcontractor ?? false,
      isDemo: input.isDemo ?? false,
    })
    .returning({ id: companies.id });

  if (!company) throw new AppError('Could not create that business.');

  await ensureSystemAccounts(db, company.id);
  await seedDefaultCategories(db, company.id);
  await seedIntegrationRows(db, company.id);

  return company.id;
}

const INTEGRATIONS: { kind: 'bank_feed' | 'accounting' | 'ocr' | 'ai' | 'email' | 'storage' | 'hmrc'; provider: string; displayName: string }[] = [
  { kind: 'bank_feed', provider: 'truelayer', displayName: 'Bank feed (open banking)' },
  { kind: 'accounting', provider: 'xero', displayName: 'Xero' },
  { kind: 'accounting', provider: 'quickbooks', displayName: 'QuickBooks Online' },
  { kind: 'accounting', provider: 'freeagent', displayName: 'FreeAgent' },
  { kind: 'ocr', provider: 'ocr', displayName: 'Receipt reading' },
  { kind: 'ai', provider: 'ai', displayName: 'AI suggestions' },
  { kind: 'email', provider: 'email', displayName: 'Email and reminders' },
  { kind: 'storage', provider: 'storage', displayName: 'Receipt storage' },
  { kind: 'hmrc', provider: 'hmrc', displayName: 'HMRC submission' },
];

export async function seedIntegrationRows(db: Database, companyId: string): Promise<void> {
  await db
    .insert(integrationConnections)
    .values(
      INTEGRATIONS.map((integration) => ({
        companyId,
        kind: integration.kind,
        provider: integration.provider,
        displayName: integration.displayName,
        status: 'not_configured' as const,
      })),
    )
    .onConflictDoNothing();
}

export type CreateUserInput = {
  email: string;
  name: string;
  password: string;
};

export async function createUser(db: Database, input: CreateUserInput): Promise<string> {
  const email = input.email.trim().toLowerCase();
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) throw new ConflictError('An account with that email address already exists.');

  const [user] = await db
    .insert(users)
    .values({ email, name: input.name.trim(), passwordHash: await hashPassword(input.password) })
    .returning({ id: users.id });

  if (!user) throw new AppError('Could not create that account.');
  return user.id;
}

export async function addMember(
  db: Database,
  companyId: string,
  userId: string,
  role: Role,
  options: { isDefault?: boolean } = {},
): Promise<void> {
  await db
    .insert(memberships)
    .values({ companyId, userId, role, isDefault: options.isDefault ?? false })
    .onConflictDoNothing();
}

export async function addBankAccount(
  db: Database,
  companyId: string,
  input: {
    name: string;
    accountType?: string;
    sortCode?: string | null;
    accountNumberLast4?: string | null;
    openingBalancePence?: number;
    openingBalanceDate?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(bankAccounts)
    .values({
      companyId,
      name: input.name,
      accountType: input.accountType ?? 'current',
      sortCode: input.sortCode ?? null,
      accountNumberLast4: input.accountNumberLast4 ?? null,
      openingBalancePence: input.openingBalancePence ?? 0,
      openingBalanceDate: input.openingBalanceDate ?? null,
    })
    .returning({ id: bankAccounts.id });
  if (!row) throw new AppError('Could not add that account.');
  return row.id;
}

export type CompanySettingsInput = {
  name?: string;
  tradingName?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  phone?: string | null;
  email?: string | null;
  vatRegistered?: boolean;
  vatNumber?: string | null;
  vatScheme?: string;
  vatPeriodMonths?: number;
  vatFirstPeriodEnd?: string | null;
  cisContractor?: boolean;
  cisSubcontractor?: boolean;
  cisUtr?: string | null;
  financialYearEndMonth?: number;
  financialYearEndDay?: number;
};

export async function updateCompanySettings(
  db: Database,
  companyId: string,
  input: CompanySettingsInput,
  userId: string,
): Promise<void> {
  const before = await db.select().from(companies).where(eq(companies.id, companyId)).limit(1);
  const current = before[0];
  if (!current) throw new NotFoundError('That business could not be found.');

  await db
    .update(companies)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(companies.id, companyId));

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(input)) {
    const previous = (current as Record<string, unknown>)[key];
    if (previous !== value) changes[key] = { from: previous ?? null, to: value ?? null };
  }

  await recordAudit(db, {
    companyId,
    action: 'company.settings_updated',
    entityType: 'company',
    entityId: companyId,
    summary: 'Business settings updated.',
    changes: Object.keys(changes).length ? changes : null,
    actorUserId: userId,
  });
}

export async function listMembers(db: Database, companyId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      lastSignedInAt: users.lastSignedInAt,
      isActive: users.isActive,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.companyId, companyId))
    .orderBy(users.name);
}

export async function removeMember(db: Database, companyId: string, userId: string): Promise<void> {
  const owners = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.role, 'owner')));
  if (owners.length <= 1 && owners.some((o) => o.userId === userId)) {
    throw new AppError('A business must always have at least one owner.');
  }
  await db
    .delete(memberships)
    .where(and(eq(memberships.companyId, companyId), eq(memberships.userId, userId)));
}
