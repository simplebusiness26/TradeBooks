'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { bankAccounts, categories, memberships, users } from '@/db/schema';
import { requirePermissionStrict } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate } from '@/lib/dates';
import { addBankAccount, createUser, removeMember, updateCompanySettings } from '@/domain/company';
import { recordAudit } from '@/domain/audit';
import { hashPassword, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { invalidateAllUserSessions } from '@/lib/session';
import { AppError, NotFoundError } from '@/lib/errors';

const businessSchema = z.object({
  name: z.string().trim().min(2, 'Enter the business name.').max(160),
  tradingName: z.string().trim().max(160).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  postcode: z.string().trim().max(12).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]).optional(),
  vatRegistered: z.boolean().default(false),
  vatNumber: z.string().trim().max(20).optional(),
  vatScheme: z.enum(['standard', 'flat_rate', 'cash']).default('standard'),
  vatPeriodMonths: z.coerce.number().int().refine((v) => [1, 3, 12].includes(v), 'Choose monthly, quarterly or yearly.'),
  vatFirstPeriodEnd: z.string().optional(),
  cisContractor: z.boolean().default(false),
  cisSubcontractor: z.boolean().default(false),
  cisUtr: z.string().trim().max(20).optional(),
  financialYearEndMonth: z.coerce.number().int().min(1).max(12).default(3),
  financialYearEndDay: z.coerce.number().int().min(1).max(31).default(31),
});

export async function updateBusinessAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('company.settings');
    const parsed = businessSchema.safeParse({
      name: formData.get('name'),
      tradingName: emptyToUndefined(formData.get('tradingName')),
      addressLine1: emptyToUndefined(formData.get('addressLine1')),
      addressLine2: emptyToUndefined(formData.get('addressLine2')),
      city: emptyToUndefined(formData.get('city')),
      postcode: emptyToUndefined(formData.get('postcode')),
      phone: emptyToUndefined(formData.get('phone')),
      email: String(formData.get('email') ?? '').trim(),
      vatRegistered: formData.get('vatRegistered') === 'yes',
      vatNumber: emptyToUndefined(formData.get('vatNumber')),
      vatScheme: formData.get('vatScheme') ?? 'standard',
      vatPeriodMonths: formData.get('vatPeriodMonths') ?? 3,
      vatFirstPeriodEnd: emptyToUndefined(formData.get('vatFirstPeriodEnd')),
      cisContractor: formData.get('cisContractor') === 'yes',
      cisSubcontractor: formData.get('cisSubcontractor') === 'yes',
      cisUtr: emptyToUndefined(formData.get('cisUtr')),
      financialYearEndMonth: formData.get('financialYearEndMonth') ?? 3,
      financialYearEndDay: formData.get('financialYearEndDay') ?? 31,
    });

    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));
    if (parsed.data.vatFirstPeriodEnd && !isIsoDate(parsed.data.vatFirstPeriodEnd)) {
      return failure('That VAT period end date is not valid.');
    }
    if (parsed.data.vatRegistered && !parsed.data.vatNumber) {
      return failure('Add your VAT number.', { vatNumber: ['Needed when VAT registered.'] });
    }

    await updateCompanySettings(
      db,
      context.company.id,
      {
        name: parsed.data.name,
        tradingName: parsed.data.tradingName ?? null,
        addressLine1: parsed.data.addressLine1 ?? null,
        addressLine2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city ?? null,
        postcode: parsed.data.postcode ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email || null,
        vatRegistered: parsed.data.vatRegistered,
        vatNumber: parsed.data.vatNumber ?? null,
        vatScheme: parsed.data.vatScheme,
        vatPeriodMonths: parsed.data.vatPeriodMonths,
        vatFirstPeriodEnd: parsed.data.vatFirstPeriodEnd ?? null,
        cisContractor: parsed.data.cisContractor,
        cisSubcontractor: parsed.data.cisSubcontractor,
        cisUtr: parsed.data.cisUtr ?? null,
        financialYearEndMonth: parsed.data.financialYearEndMonth,
        financialYearEndDay: parsed.data.financialYearEndDay,
      },
      context.user.userId,
    );

    revalidatePath('/settings/business');
    revalidatePath('/home');
    return success('Business details saved.');
  });
}

const accountSchema = z.object({
  name: z.string().trim().min(2, 'Give the account a name.').max(80),
  accountType: z.enum(['current', 'savings', 'credit_card', 'cash']).default('current'),
  sortCode: z.string().trim().max(10).optional(),
  accountNumberLast4: z.string().trim().max(4).optional(),
  openingBalance: z.string().trim().optional(),
  openingBalanceDate: z.string().optional(),
});

export async function addAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('company.settings');
    const parsed = accountSchema.safeParse({
      name: formData.get('name'),
      accountType: formData.get('accountType') ?? 'current',
      sortCode: emptyToUndefined(formData.get('sortCode')),
      accountNumberLast4: emptyToUndefined(formData.get('accountNumberLast4')),
      openingBalance: emptyToUndefined(formData.get('openingBalance')),
      openingBalanceDate: emptyToUndefined(formData.get('openingBalanceDate')),
    });
    if (!parsed.success) return failure('Please check the account details.', fieldErrorsOf(parsed.error));

    const id = await addBankAccount(db, context.company.id, {
      name: parsed.data.name,
      accountType: parsed.data.accountType,
      sortCode: parsed.data.sortCode ?? null,
      accountNumberLast4: parsed.data.accountNumberLast4 ?? null,
      openingBalancePence: parsed.data.openingBalance ? parseMoneyInput(parsed.data.openingBalance) : 0,
      openingBalanceDate:
        parsed.data.openingBalanceDate && isIsoDate(parsed.data.openingBalanceDate)
          ? parsed.data.openingBalanceDate
          : null,
    });

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'bank_account.created',
      entityType: 'bank_account',
      entityId: id,
      summary: `Bank account "${parsed.data.name}" added.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/settings/accounts');
    revalidatePath('/home');
    return success('Account added.');
  });
}

export async function archiveAccountAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('company.settings');
  const accountId = String(formData.get('accountId') ?? '');
  await db
    .update(bankAccounts)
    .set({ isArchived: true, updatedAt: new Date() })
    .where(and(eq(bankAccounts.companyId, context.company.id), eq(bankAccounts.id, accountId)));
  await recordAudit(db, {
    companyId: context.company.id,
    action: 'bank_account.archived',
    entityType: 'bank_account',
    entityId: accountId,
    summary: 'Bank account archived.',
    actorUserId: context.user.userId,
  });
  revalidatePath('/settings/accounts');
}

const inviteSchema = z.object({
  name: z.string().trim().min(2, 'Enter their name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(['owner', 'admin', 'staff', 'reviewer']),
  password: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
});

/**
 * Adds a person directly with a starting password. Email invitations need an
 * email provider; until one is connected this keeps the workflow usable.
 */
export async function addPersonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('company.members');
    const parsed = inviteSchema.safeParse({
      name: formData.get('name'),
      email: formData.get('email'),
      role: formData.get('role'),
      password: formData.get('password'),
    });
    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    let userId = existing[0]?.id;
    if (!userId) {
      userId = await createUser(db, {
        email: parsed.data.email,
        name: parsed.data.name,
        password: parsed.data.password,
      });
    }

    const alreadyMember = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.companyId, context.company.id), eq(memberships.userId, userId)))
      .limit(1);
    if (alreadyMember[0]) return failure('That person is already on this business.');

    await db.insert(memberships).values({
      companyId: context.company.id,
      userId,
      role: parsed.data.role,
    });

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'member.added',
      entityType: 'user',
      entityId: userId,
      summary: `${parsed.data.name} added as ${parsed.data.role}.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/settings/people');
    return success(
      `${parsed.data.name} can now sign in with ${parsed.data.email}. Give them the password you set — ask them to change it once email is connected.`,
    );
  });
}

export async function changeRoleAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('company.members');
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!['owner', 'admin', 'staff', 'reviewer'].includes(role)) throw new AppError('Unknown role.');

  if (userId === context.user.userId && role !== 'owner' && context.role === 'owner') {
    const owners = await db
      .select({ id: memberships.id })
      .from(memberships)
      .where(and(eq(memberships.companyId, context.company.id), eq(memberships.role, 'owner')));
    if (owners.length <= 1) throw new AppError('A business must always have at least one owner.');
  }

  await db
    .update(memberships)
    .set({ role: role as 'owner' | 'admin' | 'staff' | 'reviewer' })
    .where(and(eq(memberships.companyId, context.company.id), eq(memberships.userId, userId)));

  await recordAudit(db, {
    companyId: context.company.id,
    action: 'member.role_changed',
    entityType: 'user',
    entityId: userId,
    summary: `Role changed to ${role}.`,
    actorUserId: context.user.userId,
  });

  revalidatePath('/settings/people');
}

export async function removePersonAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('company.members');
  const userId = String(formData.get('userId') ?? '');
  await removeMember(db, context.company.id, userId);
  await recordAudit(db, {
    companyId: context.company.id,
    action: 'member.removed',
    entityType: 'user',
    entityId: userId,
    summary: 'Person removed from this business.',
    actorUserId: context.user.userId,
  });
  revalidatePath('/settings/people');
}

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters.`),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'The two passwords do not match.',
    path: ['confirmPassword'],
  });

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('records.read');
    const parsed = passwordSchema.safeParse({
      currentPassword: formData.get('currentPassword'),
      newPassword: formData.get('newPassword'),
      confirmPassword: formData.get('confirmPassword'),
    });
    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));

    const rows = await db.select().from(users).where(eq(users.id, context.user.userId)).limit(1);
    const user = rows[0];
    if (!user) throw new NotFoundError('Your account could not be found.');

    const { verifyPassword } = await import('@/lib/password');
    if (!(await verifyPassword(parsed.data.currentPassword, user.passwordHash))) {
      return failure('That is not your current password.');
    }

    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.newPassword), updatedAt: new Date() })
      .where(eq(users.id, user.id));

    // Other devices are signed out; the current session is re-created below.
    await invalidateAllUserSessions(user.id);

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'auth.password_changed',
      entityType: 'user',
      entityId: user.id,
      summary: `${user.name} changed their password. All other sessions were signed out.`,
      actorUserId: user.id,
    });

    const { createSession, setSessionCookie } = await import('@/lib/session');
    const session = await createSession(user.id, context.company.id);
    await setSessionCookie(session.token, session.expiresAt);

    return success('Password changed. You have been signed out everywhere else.');
  });
}

export async function archiveCategoryAction(formData: FormData): Promise<void> {
  const context = await requirePermissionStrict('company.settings');
  const categoryId = String(formData.get('categoryId') ?? '');
  const isArchived = String(formData.get('isArchived') ?? '') === 'yes';
  await db
    .update(categories)
    .set({ isArchived, updatedAt: new Date() })
    .where(and(eq(categories.companyId, context.company.id), eq(categories.id, categoryId)));
  revalidatePath('/settings/categories');
}

const categorySchema = z.object({
  name: z.string().trim().min(2, 'Give the category a name.').max(80),
  kind: z.enum(['income', 'expense', 'both']).default('expense'),
  description: z.string().trim().max(300).optional(),
  jobCostGroup: z.enum(['materials', 'labour', 'other', 'none']).default('none'),
  defaultVatTreatment: z
    .enum(['standard', 'reduced', 'zero', 'exempt', 'outside_scope', 'reverse_charge', 'no_vat'])
    .default('standard'),
});

export async function addCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermissionStrict('company.settings');
    const parsed = categorySchema.safeParse({
      name: formData.get('name'),
      kind: formData.get('kind') ?? 'expense',
      description: emptyToUndefined(formData.get('description')),
      jobCostGroup: formData.get('jobCostGroup') ?? 'none',
      defaultVatTreatment: formData.get('defaultVatTreatment') ?? 'standard',
    });
    if (!parsed.success) return failure('Please check the category.', fieldErrorsOf(parsed.error));

    const code = parsed.data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 40);

    const { ACCOUNTS, expenseAccountForGroup } = await import('@/domain/ledger');
    const ledgerAccountCode =
      parsed.data.kind === 'income' ? ACCOUNTS.SALES.code : expenseAccountForGroup(parsed.data.jobCostGroup);

    const [row] = await db
      .insert(categories)
      .values({
        companyId: context.company.id,
        name: parsed.data.name,
        code,
        kind: parsed.data.kind,
        description: parsed.data.description ?? null,
        defaultVatTreatment: parsed.data.defaultVatTreatment,
        isJobCost: parsed.data.jobCostGroup !== 'none',
        jobCostGroup: parsed.data.jobCostGroup,
        ledgerAccountCode,
        isSystem: false,
        sortOrder: 500,
      })
      .onConflictDoNothing()
      .returning({ id: categories.id });

    if (!row) return failure('You already have a category with that name.');

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'category.created',
      entityType: 'category',
      entityId: row.id,
      summary: `Category "${parsed.data.name}" added.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/settings/categories');
    return success('Category added.');
  });
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? undefined : text;
}

function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    (result[key] ??= []).push(issue.message);
  }
  return result;
}
