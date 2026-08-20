import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { companies, memberships } from '@/db/schema';
import { AuthenticationError, AuthorizationError } from '@/lib/errors';
import { can, type Permission, type Role } from '@/lib/permissions';
import { readSessionCookie, validateSessionToken, type SessionUser } from '@/lib/session';

export type CompanySummary = {
  id: string;
  name: string;
  tradingName: string | null;
  vatRegistered: boolean;
  vatNumber: string | null;
  vatScheme: string;
  vatPeriodMonths: number;
  cisContractor: boolean;
  cisSubcontractor: boolean;
  isDemo: boolean;
  currency: string;
};

export type AuthContext = {
  user: SessionUser;
  company: CompanySummary;
  role: Role;
  memberCompanies: { id: string; name: string; role: Role }[];
};

/**
 * Resolves the signed-in user and their active tenant. Tenant identity comes
 * from the server-side session record only — never from client input.
 */
export const getAuthContext = cache(async (): Promise<AuthContext | null> => {
  const token = await readSessionCookie();
  if (!token) return null;
  const user = await validateSessionToken(token);
  if (!user) return null;

  const rows = await db
    .select({
      id: companies.id,
      name: companies.name,
      tradingName: companies.tradingName,
      vatRegistered: companies.vatRegistered,
      vatNumber: companies.vatNumber,
      vatScheme: companies.vatScheme,
      vatPeriodMonths: companies.vatPeriodMonths,
      cisContractor: companies.cisContractor,
      cisSubcontractor: companies.cisSubcontractor,
      isDemo: companies.isDemo,
      currency: companies.currency,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, user.userId));

  if (rows.length === 0) return null;

  const active = rows.find((r) => r.id === user.activeCompanyId) ?? rows[0];
  if (!active) return null;

  const { role, ...company } = active;
  return {
    user,
    company,
    role,
    memberCompanies: rows.map((r) => ({ id: r.id, name: r.name, role: r.role })),
  };
});

/**
 * For pages and server actions: a missing session is not an error to show,
 * it is a trip to the sign-in screen.
 */
export async function requireAuth(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) redirect('/sign-in');
  return context;
}

/** For API routes, where a redirect would be useless to the caller. */
export async function requireAuthOrThrow(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) throw new AuthenticationError();
  return context;
}

export async function requirePermission(permission: Permission): Promise<AuthContext> {
  const context = await requireAuth();
  if (!can(context.role, permission)) {
    throw new AuthorizationError();
  }
  return context;
}

/** Permission check for API routes: throws rather than redirecting. */
export async function requirePermissionOrThrow(permission: Permission): Promise<AuthContext> {
  const context = await requireAuthOrThrow();
  if (!can(context.role, permission)) {
    throw new AuthorizationError();
  }
  return context;
}
