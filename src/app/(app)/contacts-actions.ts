'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { customers, suppliers } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { parseMoneyInput } from '@/lib/money';
import { recordAudit } from '@/domain/audit';
import { NotFoundError } from '@/lib/errors';

const customerSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, 'Enter their name.').max(160),
  contactName: z.string().trim().max(120).optional(),
  email: z.union([z.string().trim().email('Enter a valid email address.'), z.literal('')]).optional(),
  phone: z.string().trim().max(40).optional(),
  addressLine1: z.string().trim().max(160).optional(),
  addressLine2: z.string().trim().max(160).optional(),
  city: z.string().trim().max(80).optional(),
  postcode: z.string().trim().max(12).optional(),
  paymentTermsDays: z.coerce.number().int().min(0).max(180).default(14),
  notes: z.string().trim().max(2000).optional(),
});

export async function saveCustomerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const parsed = customerSchema.safeParse(readContact(formData));
    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));

    const values = {
      name: parsed.data.name,
      contactName: parsed.data.contactName ?? null,
      email: parsed.data.email || null,
      phone: parsed.data.phone ?? null,
      addressLine1: parsed.data.addressLine1 ?? null,
      addressLine2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city ?? null,
      postcode: parsed.data.postcode ?? null,
      paymentTermsDays: parsed.data.paymentTermsDays,
      notes: parsed.data.notes ?? null,
    };

    if (parsed.data.id) {
      const [updated] = await db
        .update(customers)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(customers.companyId, context.company.id), eq(customers.id, parsed.data.id)))
        .returning({ id: customers.id });
      if (!updated) throw new NotFoundError('That customer could not be found.');

      await recordAudit(db, {
        companyId: context.company.id,
        action: 'customer.updated',
        entityType: 'customer',
        entityId: updated.id,
        summary: `Customer ${values.name} updated.`,
        actorUserId: context.user.userId,
      });
      revalidatePath(`/customers/${updated.id}`);
      revalidatePath('/customers');
      return success('Customer updated.');
    }

    const existing = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.companyId, context.company.id), eq(customers.name, values.name)))
      .limit(1);
    if (existing[0]) return failure('You already have a customer with that name.');

    const [created] = await db
      .insert(customers)
      .values({ companyId: context.company.id, ...values })
      .returning({ id: customers.id });
    if (!created) return failure('Could not save that customer.');

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'customer.created',
      entityType: 'customer',
      entityId: created.id,
      summary: `Customer ${values.name} added.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/customers');
    redirect(`/customers/${created.id}`);
  });
}

const supplierSchema = customerSchema
  .omit({ paymentTermsDays: true })
  .extend({
    kind: z.enum(['supplier', 'subcontractor', 'both']).default('supplier'),
    vatNumber: z.string().trim().max(20).optional(),
    defaultCategoryId: z.string().uuid().nullish(),
    isSubcontractor: z.boolean().default(false),
    utr: z.string().trim().max(20).optional(),
    cisStatus: z.enum(['unknown', 'gross', 'net_20', 'net_30']).default('unknown'),
    cisVerificationNumber: z.string().trim().max(30).optional(),
    cisVerificationSource: z.string().trim().max(200).optional(),
    openingBalance: z.string().trim().optional(),
  });

export async function saveSupplierAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const kind = String(formData.get('kind') ?? 'supplier');
    const parsed = supplierSchema.safeParse({
      ...readContact(formData),
      kind,
      vatNumber: emptyToUndefined(formData.get('vatNumber')),
      defaultCategoryId: emptyToNull(formData.get('defaultCategoryId')),
      isSubcontractor: kind === 'subcontractor' || kind === 'both',
      utr: emptyToUndefined(formData.get('utr')),
      cisStatus: formData.get('cisStatus') ?? 'unknown',
      cisVerificationNumber: emptyToUndefined(formData.get('cisVerificationNumber')),
      cisVerificationSource: emptyToUndefined(formData.get('cisVerificationSource')),
      openingBalance: emptyToUndefined(formData.get('openingBalance')),
    });
    if (!parsed.success) return failure('Please check the details.', fieldErrorsOf(parsed.error));

    const values = {
      name: parsed.data.name,
      kind: parsed.data.kind,
      contactName: parsed.data.contactName ?? null,
      email: parsed.data.email || null,
      phone: parsed.data.phone ?? null,
      addressLine1: parsed.data.addressLine1 ?? null,
      addressLine2: parsed.data.addressLine2 ?? null,
      city: parsed.data.city ?? null,
      postcode: parsed.data.postcode ?? null,
      notes: parsed.data.notes ?? null,
      vatNumber: parsed.data.vatNumber ?? null,
      defaultCategoryId: parsed.data.defaultCategoryId ?? null,
      isSubcontractor: parsed.data.isSubcontractor,
      utr: parsed.data.utr ?? null,
      cisStatus: parsed.data.cisStatus,
      cisVerificationNumber: parsed.data.cisVerificationNumber ?? null,
      cisVerificationSource: parsed.data.cisVerificationSource ?? null,
      cisVerifiedAt: parsed.data.cisVerificationNumber ? new Date() : null,
      openingBalancePence: parsed.data.openingBalance ? parseMoneyInput(parsed.data.openingBalance) : 0,
    };

    if (parsed.data.id) {
      const [updated] = await db
        .update(suppliers)
        .set({ ...values, updatedAt: new Date() })
        .where(and(eq(suppliers.companyId, context.company.id), eq(suppliers.id, parsed.data.id)))
        .returning({ id: suppliers.id });
      if (!updated) throw new NotFoundError('That supplier could not be found.');

      await recordAudit(db, {
        companyId: context.company.id,
        action: 'supplier.updated',
        entityType: 'supplier',
        entityId: updated.id,
        summary: `Supplier ${values.name} updated.`,
        actorUserId: context.user.userId,
      });
      revalidatePath(`/suppliers/${updated.id}`);
      revalidatePath('/suppliers');
      revalidatePath('/subcontractors');
      return success('Supplier updated.');
    }

    const existing = await db
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(and(eq(suppliers.companyId, context.company.id), eq(suppliers.name, values.name)))
      .limit(1);
    if (existing[0]) return failure('You already have a supplier with that name.');

    const [created] = await db
      .insert(suppliers)
      .values({ companyId: context.company.id, ...values })
      .returning({ id: suppliers.id });
    if (!created) return failure('Could not save that supplier.');

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'supplier.created',
      entityType: 'supplier',
      entityId: created.id,
      summary: `Supplier ${values.name} added.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/suppliers');
    redirect(`/suppliers/${created.id}`);
  });
}

function readContact(formData: FormData) {
  return {
    id: emptyToUndefined(formData.get('id')),
    name: formData.get('name'),
    contactName: emptyToUndefined(formData.get('contactName')),
    email: String(formData.get('email') ?? '').trim(),
    phone: emptyToUndefined(formData.get('phone')),
    addressLine1: emptyToUndefined(formData.get('addressLine1')),
    addressLine2: emptyToUndefined(formData.get('addressLine2')),
    city: emptyToUndefined(formData.get('city')),
    postcode: emptyToUndefined(formData.get('postcode')),
    paymentTermsDays: formData.get('paymentTermsDays') ?? 14,
    notes: emptyToUndefined(formData.get('notes')),
  };
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = value === null ? '' : String(value).trim();
  return text === '' ? null : text;
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
