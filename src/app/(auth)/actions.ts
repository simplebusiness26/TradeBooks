'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db/client';
import { users } from '@/db/schema';
import { verifyPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import {
  clearSessionCookie,
  createSession,
  firstCompanyForUser,
  invalidateSession,
  readSessionCookie,
  setSessionCookie,
  validateSessionToken,
} from '@/lib/session';
import { checkRateLimit, RATE_LIMITS, resetRateLimit } from '@/lib/rate-limit';
import { failure, runAction, type ActionState } from '@/lib/action-result';
import { addMember, createCompany, createUser } from '@/domain/company';
import { recordAudit } from '@/domain/audit';
import { AppError } from '@/lib/errors';

const MAX_FAILED_ATTEMPTS = 10;
const LOCK_MINUTES = 15;

const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
});

async function requestContext() {
  const headerList = await headers();
  return {
    ip:
      headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      headerList.get('x-real-ip') ??
      'unknown',
    userAgent: headerList.get('user-agent'),
  };
}

export async function signInAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const parsed = signInSchema.safeParse({
      email: formData.get('email'),
      password: formData.get('password'),
    });
    if (!parsed.success) {
      return failure('Please check your details.', fieldErrorsOf(parsed.error));
    }

    const { ip, userAgent } = await requestContext();
    checkRateLimit(`sign-in:${ip}`, RATE_LIMITS.signIn);
    checkRateLimit(`sign-in:${parsed.data.email}`, RATE_LIMITS.signIn);

    const rows = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const user = rows[0];

    // The same message either way, so the form cannot be used to discover
    // which email addresses have accounts.
    const genericFailure = failure('Those details do not match an account.');

    if (!user) {
      // Spend comparable time so timing does not reveal the answer either.
      await verifyPassword(parsed.data.password, 'scrypt$16384$8$1$AAAA$AAAA');
      return genericFailure;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      return failure('This account is temporarily locked after too many failed attempts.');
    }

    if (!user.isActive) return failure('This account has been switched off.');

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) {
      const failedCount = user.failedSignInCount + 1;
      await db
        .update(users)
        .set({
          failedSignInCount: failedCount,
          lockedUntil:
            failedCount >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
        })
        .where(eq(users.id, user.id));
      return genericFailure;
    }

    await db
      .update(users)
      .set({ failedSignInCount: 0, lockedUntil: null, lastSignedInAt: new Date() })
      .where(eq(users.id, user.id));

    resetRateLimit(`sign-in:${parsed.data.email}`);

    const companyId = await firstCompanyForUser(user.id);
    const session = await createSession(user.id, companyId, { userAgent, ipAddress: ip });
    await setSessionCookie(session.token, session.expiresAt);

    if (companyId) {
      await recordAudit(db, {
        companyId,
        action: 'auth.signed_in',
        entityType: 'user',
        entityId: user.id,
        summary: `${user.name} signed in.`,
        actorUserId: user.id,
        ipAddress: ip,
      });
    }

    redirect(companyId ? '/home' : '/settings/business');
  });
}

const signUpSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter your name.').max(120),
    businessName: z.string().trim().min(2, 'Enter your business name.').max(160),
    email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
    password: z
      .string()
      .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`)
      .max(200),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const parsed = signUpSchema.safeParse({
      name: formData.get('name'),
      businessName: formData.get('businessName'),
      email: formData.get('email'),
      password: formData.get('password'),
      confirmPassword: formData.get('confirmPassword'),
    });
    if (!parsed.success) {
      return failure('Please check the highlighted fields.', fieldErrorsOf(parsed.error));
    }

    const { ip, userAgent } = await requestContext();
    checkRateLimit(`sign-up:${ip}`, RATE_LIMITS.signUp);

    const userId = await createUser(db, {
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
    });
    const companyId = await createCompany(db, { name: parsed.data.businessName, trade: 'roofing' });
    await addMember(db, companyId, userId, 'owner', { isDefault: true });

    await recordAudit(db, {
      companyId,
      action: 'company.created',
      entityType: 'company',
      entityId: companyId,
      summary: `${parsed.data.businessName} created by ${parsed.data.name}.`,
      actorUserId: userId,
      ipAddress: ip,
    });

    const session = await createSession(userId, companyId, { userAgent, ipAddress: ip });
    await setSessionCookie(session.token, session.expiresAt);
    redirect('/settings/business?welcome=1');
  });
}

export async function signOutAction(): Promise<void> {
  const token = await readSessionCookie();
  if (token) {
    const session = await validateSessionToken(token);
    if (session) await invalidateSession(session.sessionId);
  }
  await clearSessionCookie();
  redirect('/sign-in');
}

export async function switchCompanyAction(formData: FormData): Promise<void> {
  const companyId = String(formData.get('companyId') ?? '');
  const token = await readSessionCookie();
  if (!token) redirect('/sign-in');
  const session = await validateSessionToken(token);
  if (!session) redirect('/sign-in');

  const { membershipFor, setSessionCompany } = await import('@/lib/session');
  const membership = await membershipFor(session.userId, companyId);
  if (!membership) throw new AppError('You are not a member of that business.');

  await setSessionCompany(session.sessionId, companyId);
  redirect('/home');
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
