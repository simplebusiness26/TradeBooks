import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { and, eq, lt } from 'drizzle-orm';
import { db } from '@/db/client';
import { memberships, sessions, users, companies } from '@/db/schema';
import { env } from '@/lib/env';

export const SESSION_COOKIE = 'tb_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_RENEW_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15;

/**
 * The raw token is only ever held by the client. The database stores its
 * SHA-256 digest, so a database leak cannot be replayed as a session.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  userId: string,
  activeCompanyId: string | null,
  context: { userAgent?: string | null; ipAddress?: string | null } = {},
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: hashSessionToken(token),
    userId,
    activeCompanyId,
    expiresAt,
    userAgent: context.userAgent?.slice(0, 400) ?? null,
    ipAddress: context.ipAddress ?? null,
  });
  return { token, expiresAt };
}

export type SessionUser = {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  activeCompanyId: string | null;
};

export async function validateSessionToken(token: string): Promise<SessionUser | null> {
  const id = hashSessionToken(token);
  const rows = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      activeCompanyId: sessions.activeCompanyId,
      userId: users.id,
      email: users.email,
      name: users.name,
      isActive: users.isActive,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.expiresAt.getTime() <= Date.now() || !row.isActive) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (row.expiresAt.getTime() - Date.now() < SESSION_RENEW_THRESHOLD_MS) {
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_TTL_MS) })
      .where(eq(sessions.id, id));
  }

  return {
    sessionId: row.sessionId,
    userId: row.userId,
    email: row.email,
    name: row.name,
    activeCompanyId: row.activeCompanyId,
  };
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export async function invalidateAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function setSessionCompany(sessionId: string, companyId: string): Promise<void> {
  await db.update(sessions).set({ activeCompanyId: companyId }).where(eq(sessions.id, sessionId));
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env().NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function readSessionCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function firstCompanyForUser(userId: string): Promise<string | null> {
  const rows = await db
    .select({ companyId: memberships.companyId })
    .from(memberships)
    .innerJoin(companies, eq(companies.id, memberships.companyId))
    .where(eq(memberships.userId, userId))
    .limit(1);
  return rows[0]?.companyId ?? null;
}

export async function membershipFor(
  userId: string,
  companyId: string,
): Promise<{ role: 'owner' | 'admin' | 'staff' | 'reviewer' } | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}
