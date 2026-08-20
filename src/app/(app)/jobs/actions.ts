'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { jobs } from '@/db/schema';
import { requirePermission } from '@/lib/auth-context';
import { failure, runAction, success, type ActionState } from '@/lib/action-result';
import { parseMoneyInput } from '@/lib/money';
import { isIsoDate } from '@/lib/dates';
import { recordAudit } from '@/domain/audit';
import { NotFoundError } from '@/lib/errors';

const JOB_STATUSES = ['quoted', 'active', 'on_hold', 'completed', 'invoiced', 'closed', 'cancelled'] as const;

const jobSchema = z.object({
  reference: z.string().trim().min(1, 'Give the job a reference.').max(40),
  name: z.string().trim().min(2, 'Give the job a name.').max(160),
  customerId: z.string().uuid().nullish(),
  status: z.enum(JOB_STATUSES).default('quoted'),
  siteAddressLine1: z.string().trim().max(160).optional(),
  siteCity: z.string().trim().max(80).optional(),
  sitePostcode: z.string().trim().max(12).optional(),
  description: z.string().trim().max(2000).optional(),
  quotedRevenue: z.string().trim().optional(),
  estimatedCost: z.string().trim().optional(),
  startDate: z.string().refine((v) => v === '' || isIsoDate(v)).optional(),
  endDate: z.string().refine((v) => v === '' || isIsoDate(v)).optional(),
});

export async function createJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const parsed = jobSchema.safeParse(readForm(formData));
    if (!parsed.success) return failure('Please check the job details.', fieldErrorsOf(parsed.error));

    const existing = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.companyId, context.company.id), eq(jobs.reference, parsed.data.reference)))
      .limit(1);
    if (existing[0]) {
      return failure('That job reference is already used.', { reference: ['Already used.'] });
    }

    const [row] = await db
      .insert(jobs)
      .values({
        companyId: context.company.id,
        reference: parsed.data.reference,
        name: parsed.data.name,
        customerId: parsed.data.customerId ?? null,
        status: parsed.data.status,
        siteAddressLine1: parsed.data.siteAddressLine1 ?? null,
        siteCity: parsed.data.siteCity ?? null,
        sitePostcode: parsed.data.sitePostcode ?? null,
        description: parsed.data.description ?? null,
        quotedRevenuePence: parsed.data.quotedRevenue ? parseMoneyInput(parsed.data.quotedRevenue) : 0,
        estimatedCostPence: parsed.data.estimatedCost ? parseMoneyInput(parsed.data.estimatedCost) : 0,
        startDate: parsed.data.startDate || null,
        endDate: parsed.data.endDate || null,
      })
      .returning({ id: jobs.id });

    if (!row) return failure('Could not create that job.');

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'job.created',
      entityType: 'job',
      entityId: row.id,
      summary: `Job ${parsed.data.reference} — ${parsed.data.name} created.`,
      actorUserId: context.user.userId,
    });

    revalidatePath('/jobs');
    redirect(`/jobs/${row.id}`);
  });
}

export async function updateJobAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const context = await requirePermission('records.write');
    const jobId = String(formData.get('jobId') ?? '');
    const parsed = jobSchema.safeParse(readForm(formData));
    if (!parsed.success) return failure('Please check the job details.', fieldErrorsOf(parsed.error));

    const [updated] = await db
      .update(jobs)
      .set({
        reference: parsed.data.reference,
        name: parsed.data.name,
        customerId: parsed.data.customerId ?? null,
        status: parsed.data.status,
        siteAddressLine1: parsed.data.siteAddressLine1 ?? null,
        siteCity: parsed.data.siteCity ?? null,
        sitePostcode: parsed.data.sitePostcode ?? null,
        description: parsed.data.description ?? null,
        quotedRevenuePence: parsed.data.quotedRevenue ? parseMoneyInput(parsed.data.quotedRevenue) : 0,
        estimatedCostPence: parsed.data.estimatedCost ? parseMoneyInput(parsed.data.estimatedCost) : 0,
        startDate: parsed.data.startDate || null,
        endDate: parsed.data.endDate || null,
        updatedAt: new Date(),
      })
      .where(and(eq(jobs.companyId, context.company.id), eq(jobs.id, jobId)))
      .returning({ id: jobs.id });

    if (!updated) throw new NotFoundError('That job could not be found.');

    await recordAudit(db, {
      companyId: context.company.id,
      action: 'job.updated',
      entityType: 'job',
      entityId: jobId,
      summary: `Job ${parsed.data.reference} updated.`,
      actorUserId: context.user.userId,
    });

    revalidatePath(`/jobs/${jobId}`);
    revalidatePath('/jobs');
    return success('Job updated.');
  });
}

function readForm(formData: FormData) {
  return {
    reference: formData.get('reference'),
    name: formData.get('name'),
    customerId: emptyToNull(formData.get('customerId')),
    status: formData.get('status') ?? 'quoted',
    siteAddressLine1: emptyToUndefined(formData.get('siteAddressLine1')),
    siteCity: emptyToUndefined(formData.get('siteCity')),
    sitePostcode: emptyToUndefined(formData.get('sitePostcode')),
    description: emptyToUndefined(formData.get('description')),
    quotedRevenue: emptyToUndefined(formData.get('quotedRevenue')),
    estimatedCost: emptyToUndefined(formData.get('estimatedCost')),
    startDate: String(formData.get('startDate') ?? ''),
    endDate: String(formData.get('endDate') ?? ''),
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
